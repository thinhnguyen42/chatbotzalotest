/**
 * spamGuard.ts
 * ============
 * BỘ LỌC CHỐNG SPAM & JUNK MESSAGES TOÀN DIỆN:
 * 1. Chống Spam Lặp Lại (Duplicate Spam): Cùng 1 nội dung >= 3 lần / 30s -> Bỏ qua.
 * 2. Chống Spam Tần Suất Cao (Frequency Burst): > 5 tin nhắn bất kỳ / 10s -> Bỏ qua.
 * 3. Chống Rác / Phím Bừa (Junk / Keyboard Mash): Ký tự vô nghĩa, lặp ký tự, không nguyên âm -> Bỏ qua.
 */

const REPEAT_LIMIT   = 3;       // Số lần tối đa cho phép cùng 1 nội dung
const REPEAT_WINDOW  = 30_000;  // 30 giây cửa sổ lặp lại

const RATE_MAX       = 5;       // Số tin nhắn tối đa trong cửa sổ tần suất
const RATE_WINDOW    = 10_000;  // 10 giây cửa sổ tần suất

interface RepeatEntry {
    count: number;
    timer: ReturnType<typeof setTimeout>;
}
const repeatMap = new Map<string, RepeatEntry>();

interface RateEntry {
    timestamps: number[];
}
const userRateMap = new Map<string, RateEntry>();

/**
 * Kiểm tra tin nhắn lặp lại chính xác.
 */
export function checkRepeatSpam(userId: string, text: string): "ok" | "ignore" {
    const key = `${userId}:${text.trim().toLowerCase()}`;
    const now = Date.now();

    const entry = repeatMap.get(key);

    if (!entry) {
        const timer = setTimeout(() => repeatMap.delete(key), REPEAT_WINDOW);
        repeatMap.set(key, { count: 1, timer });
        return "ok";
    }

    entry.count += 1;

    if (entry.count >= REPEAT_LIMIT) {
        console.log(
            `[spamGuard] Bỏ qua tin nhắn lặp lại (${entry.count}/${REPEAT_LIMIT}) ` +
            `từ user ${userId}: "${text.trim().substring(0, 40)}"`
        );
        return "ignore";
    }

    return "ok";
}

/**
 * Kiểm tra giới hạn tần suất gửi tin nhắn (Max 5 tin / 10s).
 */
export function checkRateSpam(userId: string): "ok" | "ignore" {
    const now = Date.now();
    let entry = userRateMap.get(userId);

    if (!entry) {
        entry = { timestamps: [] };
        userRateMap.set(userId, entry);
    }

    // Lọc lại các mốc thời gian trong vòng 10s gần nhất
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < RATE_WINDOW);
    entry.timestamps.push(now);

    if (entry.timestamps.length > RATE_MAX) {
        console.log(
            `[spamGuard] Bỏ qua do vượt quá tần suất (${entry.timestamps.length} tin/10s) ` +
            `từ user ${userId}`
        );
        return "ignore";
    }

    return "ok";
}

/**
 * Nhận diện tin nhắn rác, phím bừa, gõ linh tinh (Junk / Keyboard Mash Detection).
 */
export function isJunkText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;

    // Ngoại lệ: Cho phép số phòng hợp lệ (ví dụ: 101, 1204, phòng 101, P.101)
    if (/^(phòng\s*|phong\s*|p\.?\s*)?\d{3,4}$/i.test(trimmed)) return false;

    // 1. Lặp ký tự liên tiếp quá nhiều (vd: "aaaaaaa", "hhhhhh", "hahahaha...")
    if (/(.)\1{4,}/i.test(trimmed)) return true;

    // 2. Toàn ký tự đặc biệt / dấu câu (vd: "???????", "!!!!!!", "......", "#@$%^")
    if (/^[^\w\s\u00C0-\u024F\u1EA0-\u1EF9]+$/i.test(trimmed)) return true;

    // 3. Chuỗi phụ âm liên tiếp >= 5 ký tự (Gõ phím bừa: "asdfghjkl", "sdfghjkl", "bczxqv")
    if (/[bcdfghjklmnpqrstvwxzđ]{5,}/i.test(trimmed)) return true;

    // 4. Chuỗi từ dài không có nguyên âm tiếng Việt/Anh (Bỏ qua từ chỉ toàn chữ số / số điện thoại)
    const words = trimmed.split(/\s+/);
    for (const word of words) {
        // Bỏ qua các chuỗi chỉ chứa chữ số, số điện thoại, hoặc số kèm dấu chấm/phẩy (vd: 0123456788, 101, 14h)
        if (/^[\d.,\-\/]+$/.test(word) || /^\d+[a-z]?$/i.test(word)) continue;

        if (
            word.length >= 5 &&
            !/[aeiouyáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(word)
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Bộ kiểm tra tổng hợp tất cả các loại Spam & Junk.
 */
export function checkSpamGuard(userId: string, text: string): "ok" | "ignore" {
    // 1. Kiểm tra tần suất (Max 5 tin / 10s)
    if (checkRateSpam(userId) === "ignore") return "ignore";

    // 2. Kiểm tra phím bừa / tin nhắn rác
    if (isJunkText(text)) {
        console.log(`[spamGuard] Phát hiện tin nhắn rác/phím bừa từ ${userId}: "${text}"`);
        return "ignore";
    }

    // 3. Kiểm tra tin nhắn lặp lại (Max 3 lần / 30s)
    return checkRepeatSpam(userId, text);
}

/** Xoá toàn bộ lịch sử spam của một user (dùng khi cần reset thủ công). */
export function clearUserSpam(userId: string): void {
    repeatMap.delete(userId);
    userRateMap.delete(userId);
    for (const key of repeatMap.keys()) {
        if (key.startsWith(`${userId}:`)) {
            repeatMap.delete(key);
        }
    }
}
