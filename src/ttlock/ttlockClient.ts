import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { checkRateLimit, getLockIdForTag } from "./lockRegistry";

export interface PasscodeResult {
    success: boolean;
    passcode?: string;
    validMinutes?: number;
    expiresAt?: number;
    error?: string;
}

const PRIMARY_URL = process.env.TTLOCK_SERVICE_URL || "http://localhost:8001";
const TTLOCK_API_TOKEN   = process.env.TTLOCK_API_TOKEN   || "";
const DEFAULT_VALID_MINS = 30; // TTLock Cloud API yêu cầu tối thiểu 30 phút cho Period passcode

// Giữ kết nối HTTP/HTTPS mở (Keep-Alive) để tái sử dụng socket TLS, tiết kiệm 500-700ms mỗi request
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });
const ttlockHttp = axios.create({ httpsAgent });

// File lưu trữ token TTLock dài hạn (Token có hạn 90 ngày)
const TTLOCK_TOKEN_FILE = path.join(__dirname, "..", "..", "data", "ttlock-token.json");

function loadTTLockToken(): { accessToken: string; expiresAt: number } | null {
    try {
        if (fs.existsSync(TTLOCK_TOKEN_FILE)) {
            const raw = fs.readFileSync(TTLOCK_TOKEN_FILE, "utf-8");
            const data = JSON.parse(raw);
            if (data?.accessToken && data?.expiresAt > Date.now() + 60 * 1000) {
                return data;
            }
        }
    } catch {}
    return null;
}

function saveTTLockToken(state: { accessToken: string; expiresAt: number }): void {
    try {
        const dir = path.dirname(TTLOCK_TOKEN_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TTLOCK_TOKEN_FILE, JSON.stringify(state, null, 2), "utf-8");
    } catch {}
}

let cachedTokenState: { accessToken: string; expiresAt: number } | null = loadTTLockToken();

function md5(text: string): string {
    if (text.length === 32 && /^[0-9a-fA-F]+$/.test(text)) {
        return text.toLowerCase();
    }
    return crypto.createHash("md5").update(text).digest("hex");
}

/**
 * Lấy Access Token từ TTLock Cloud API (Sciener)
 * Nhờ có file lưu trữ ttlock-token.json, token sống 90 ngày và tái sử dụng 0ms qua mọi lần restart server.
 */
async function getTTLockAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedTokenState && cachedTokenState.expiresAt > now + 60 * 1000) {
        return cachedTokenState.accessToken;
    }

    const clientId = process.env.TTLOCK_CLIENT_ID;
    const clientSecret = process.env.TTLOCK_CLIENT_SECRET;
    const username = process.env.TTLOCK_USERNAME;
    const rawPassword = process.env.TTLOCK_PASSWORD || "";
    const apiBase = process.env.TTLOCK_BASE_API || "https://euapi.sciener.com";

    if (!clientId || !clientSecret || !username || !rawPassword) {
        throw new Error("Thiếu cấu hình TTLock credentials trong .env");
    }

    const passwordMd5 = md5(rawPassword);

    const tokenRes = await ttlockHttp.post(
        `${apiBase}/oauth2/token`,
        new URLSearchParams({
            clientId,
            clientSecret,
            username,
            password: passwordMd5,
        }),
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 8000,
        }
    );

    const data = tokenRes.data;
    if (!data?.access_token) {
        const errMsg = data?.errmsg || data?.description || JSON.stringify(data);
        throw new Error(`TTLock OAuth2 thất bại: ${errMsg}`);
    }

    const expiresInSec = Number(data.expires_in || 7776000);
    cachedTokenState = {
        accessToken: data.access_token,
        expiresAt: now + expiresInSec * 1000,
    };
    saveTTLockToken(cachedTokenState);

    console.log(`[ttlockClient] Đã lấy & lưu TTLock Access Token thành công (hết hạn sau ${Math.round(expiresInSec / 86400)} ngày)`);
    return cachedTokenState.accessToken;
}

/**
 * Tạo passcode trực tiếp qua TTLock Cloud API (Cực nhanh ~350ms nhờ Keep-Alive connection)
 */
async function createPasscodeDirect(tagCode: string, validMinutes: number, name: string): Promise<PasscodeResult> {
    const lockId = getLockIdForTag(tagCode);
    const accessToken = await getTTLockAccessToken();
    const apiBase = process.env.TTLOCK_BASE_API || "https://euapi.sciener.com";
    const clientId = process.env.TTLOCK_CLIENT_ID || "";
    const now = Date.now();
    const apiMinutes = Math.max(30, validMinutes);

    const res = await ttlockHttp.post(
        `${apiBase}/v3/keyboardPwd/get`,
        new URLSearchParams({
            clientId,
            accessToken,
            lockId: String(lockId),
            keyboardPwdType: "3", // Period
            keyboardPwdName: name,
            startDate: String(now),
            endDate: String(now + apiMinutes * 60 * 1000),
            date: String(now),
        }),
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 8000,
        }
    );

    const data = res.data;
    if (data?.keyboardPwd) {
        console.log(`[ttlockClient] ✅ Tạo passcode trực tiếp thành công: ${data.keyboardPwd} cho Lock ID ${lockId}`);
        return {
            success: true,
            passcode: String(data.keyboardPwd),
            validMinutes: apiMinutes,
            expiresAt: now + apiMinutes * 60 * 1000,
        };
    }

    console.error(`[ttlockClient] TTLock Cloud API trả về lỗi:`, data);
    return { success: false, error: data?.errmsg || "ttlock_api_error" };
}

export async function requestPasscode(
    tagCode: string,
    userId: string,
    skipRateLimitCheck: boolean = false
): Promise<PasscodeResult> {
    // 1. Kiểm tra rate-limit nếu không được miễn trừ
    if (!skipRateLimitCheck) {
        const rateCheck = checkRateLimit(userId);
        if (!rateCheck.allowed) {
            const h = rateCheck.remainingHours ?? 0;
            const m = rateCheck.remainingMinutes ?? 0;
            const timeStr = h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
            return { success: false, error: `rate_limited:${timeStr}` };
        }
    }

    const passcodeName = `ZaloBot-${userId.slice(-6)}`;

    // 2. CHIẾN LƯỢC TỐI ƯU TỐC ĐỘ (SPEED-FIRST):
    // Gọi trực tiếp TTLock Cloud API qua kết nối Keep-Alive (chỉ mất ~350ms, không phụ thuộc service trung gian)
    try {
        return await createPasscodeDirect(tagCode, DEFAULT_VALID_MINS, passcodeName);
    } catch (directErr: any) {
        console.warn(`[ttlockClient] Gọi trực tiếp Cloud thất bại (${directErr.message}), thử fallback sang FastAPI local...`);
    }

    // 3. FALLBACK: Nếu mạng quốc tế chập chờn, thử gọi FastAPI nội bộ (nếu có uvicorn đang chạy)
    try {
        const res = await axios.post(
            `${PRIMARY_URL}/passcode/for-tag`,
            {
                tag_code: tagCode,
                valid_minutes: DEFAULT_VALID_MINS,
                name: passcodeName,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${TTLOCK_API_TOKEN}`,
                },
                timeout: 2500,
            }
        );

        const data = res.data;
        if (data?.passcode) {
            console.log(`[ttlockClient] Tạo passcode fallback qua FastAPI service (${PRIMARY_URL}): ${data.passcode}`);
            return {
                success: true,
                passcode: String(data.passcode),
                validMinutes: data.valid_minutes ?? DEFAULT_VALID_MINS,
                expiresAt: data.expires_at,
            };
        }
    } catch (fallbackErr: any) {
        console.error(`[ttlockClient] Cả Cloud API và Fallback Local đều thất bại:`, fallbackErr.message);
    }

    return { success: false, error: "service_unavailable" };
}

/**
 * Làm nóng trước (Pre-warm) kết nối TTLock và nạp token sẵn sàng khi server khởi động
 */
export async function prewarmTTLock(): Promise<void> {
    try {
        const token = await getTTLockAccessToken();
        if (token) {
            console.log("[ttlockClient] ⚡ Đã sẵn sàng kết nối TTLock Cloud (Pre-warmed).");
        }
    } catch (err: any) {
        console.warn("[ttlockClient] Cảnh báo pre-warm TTLock:", err.message);
    }
}
