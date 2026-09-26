// Rate-limit: tối đa MAX_PER_DAY lần/ngày mỗi user (trong cửa sổ 24 giờ)
const MAX_PER_DAY = Number(process.env.PASSCODE_MAX_PER_DAY) || 10;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 giờ (1 ngày)
const requestLog = new Map<string, number[]>();

export interface ActivePasscodeInfo {
    passcode: string;
    expiresAt: number;
    validMinutes: number;
    tagCode: string;
    doorLabel: string;
}

// Bộ nhớ đệm lưu các mã passcode đang còn hiệu lực theo từng user & loại cửa
const activePasscodeCache = new Map<string, ActivePasscodeInfo>();

/**
 * Kiểm tra xem người dùng đã có passcode còn hiệu lực cho cửa này chưa (còn > 2 phút).
 * Nếu còn, trả về thông tin mã để tái sử dụng mà không cần sinh mã mới hay trừ quota ngày.
 */
export function getActivePasscode(userId: string, tagCode: string): ActivePasscodeInfo | null {
    const key = `${userId}_${tagCode}`;
    const cached = activePasscodeCache.get(key);
    if (!cached) return null;

    if (cached.expiresAt > Date.now() + 2 * 60 * 1000) {
        return cached;
    }
    activePasscodeCache.delete(key);
    return null;
}

/**
 * Lưu passcode vừa tạo vào bộ nhớ đệm
 */
export function saveActivePasscode(userId: string, tagCode: string, info: ActivePasscodeInfo): void {
    const key = `${userId}_${tagCode}`;
    activePasscodeCache.set(key, info);
}

// Danh sách Zalo UID được miễn trừ giới hạn (Unlimited calls cho Tester & Admin)
const RATE_LIMIT_WHITELIST = new Set<string>([
    "6962737755353011552", // ID tester của bạn
    ...(process.env.PASSCODE_WHITELIST_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    ...(process.env.ADMIN_ZALO_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    ...(process.env.ZALO_ADMIN_USER_ID ? [process.env.ZALO_ADMIN_USER_ID.trim()] : []),
]);

export function checkRateLimit(userId: string): { allowed: boolean; remainingHours?: number; remainingMinutes?: number } {
    // Miễn trừ hoàn toàn cho các ID trong Whitelist
    if (RATE_LIMIT_WHITELIST.has(userId)) {
        return { allowed: true };
    }

    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const history = (requestLog.get(userId) || []).filter((ts) => ts > windowStart);

    if (history.length >= MAX_PER_DAY) {
        const oldestInWindow = Math.min(...history);
        const resetAt = oldestInWindow + WINDOW_MS;
        const totalMinutesLeft = Math.ceil((resetAt - now) / (60 * 1000));
        const remainingHours = Math.floor(totalMinutesLeft / 60);
        const remainingMinutes = totalMinutesLeft % 60;
        return { 
            allowed: false, 
            remainingHours, 
            remainingMinutes 
        };
    }

    history.push(now);
    requestLog.set(userId, history);
    return { allowed: true };
}

// Bảng ánh xạ mã định danh phòng / cổng sang Lock ID của TTLock
export const LOCK_MAP: Record<string, number> = {
    "38PBV-101": 30743016,
    "38PBV-102": 33847992,
    "38PBV-201": 33848342,
    "38PBV-202": 33848352,
    "38PBV-301": 33848364,
    "38PBV-302": 33848382,
    "38PBV-303": 33848398,
    "38PBV-304": 33848406,
    "38PBV-401": 33848418,
    "38PBV-402": 33848428,
    "38PBV-403": 33848436,
    "38PBV-404": 33848450,
    "38PBV-501": 33848462,
    "38PBV-502": 33848490,
    "38PBV-503": 33848500,
    "38PBV-504": 33848512,
    "38PBV-601": 30537434,
    "P601": 30537434,
    "P101": 30743016,
    "P102": 33847992,
    "P201": 33848342,
    "P202": 33848352,
    "P301": 33848364,
    "P302": 33848382,
    "P303": 33848398,
    "P304": 33848406,
    "P401": 33848418,
    "P402": 33848428,
    "P403": 33848436,
    "P404": 33848450,
    "P501": 33848462,
    "P502": 33848490,
    "P503": 33848500,
    "P504": 33848512,
    "CONG_NHO_IN": 33410738,
    "CONG_NHO_OUT": 33410764,
    "CONG_LON_IN": 30788356,
    "CONG_LON_OUT": 30788416,
    "CUA_SANH": 25417839,
    "GARA_IN": 33197162,
    "GARA_OUT": 30645446,
    "LAB": 30537434,
};

export function getLockIdForTag(tagCode: string): number {
    const raw = (tagCode || "").trim().toUpperCase();
    if (LOCK_MAP[raw]) return LOCK_MAP[raw];

    // Thử chuẩn hóa (ví dụ: "601" -> "38PBV-601" hoặc "P601")
    const cleanNum = raw.replace(/\D/g, "");
    if (cleanNum) {
        if (LOCK_MAP[`38PBV-${cleanNum}`]) return LOCK_MAP[`38PBV-${cleanNum}`];
        if (LOCK_MAP[`P${cleanNum}`]) return LOCK_MAP[`P${cleanNum}`];
    }

    // Mặc định fallback về cổng nhỏ nếu không tìm thấy khóa phòng
    return LOCK_MAP["CONG_NHO_IN"] || 33410738;
}
