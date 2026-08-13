/**
 * humanHandover.ts
 * ================
 * Quản lý trạng thái Chuyển Giao Người Thật (Human Handover Protocol):
 * 1. Tự động tạm dừng Bot khi Admin / Nhân viên gửi tin nhắn cho khách (Event: oa_send_text).
 * 2. Tự động tạm dừng Bot khi phát hiện Sự cố / Báo hỏng / Khẩn cấp để Admin tự hỗ trợ.
 * 3. Tự động khôi phục Bot sau HANDOVER_TIMEOUT_MS (30 phút không có tin nhắn mới từ Admin).
 * 4. Cho phép Admin bật/tắt Bot bằng lệnh thủ công (#pause, #resume, /bot off, /bot on).
 */

const HANDOVER_TIMEOUT_MS = 5 * 60 * 1000; // 5 phút tự động hết hạn Handover

interface HandoverState {
    active: boolean;
    lastAdminActionTime: number;
    timer?: ReturnType<typeof setTimeout>;
}

// Map: userId -> HandoverState
const handoverMap = new Map<string, HandoverState>();

/**
 * Kiểm tra xem User này có đang trong chế độ Nhân viên hỗ trợ hay không.
 * @returns true nếu đang có nhân viên chăm sóc (Bot phải IM LẶNG)
 */
export function isHumanHandoverActive(userId: string): boolean {
    const state = handoverMap.get(userId);
    if (!state || !state.active) return false;

    // Check xem đã quá thời gian 30 phút chưa
    const elapsed = Date.now() - state.lastAdminActionTime;
    if (elapsed > HANDOVER_TIMEOUT_MS) {
        console.log(`[humanHandover] Tự động hết hạn Handover cho user ${userId} sau 5 phút. Khôi phục Bot.`);
        clearHandoverMode(userId);
        return false;
    }

    return true;
}

/**
 * Bật chế độ Nhân viên hỗ trợ cho User (Tạm dừng Bot).
 */
export function setHumanHandoverMode(userId: string, durationMs: number = HANDOVER_TIMEOUT_MS): void {
    const existing = handoverMap.get(userId);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
        console.log(`[humanHandover] Hết hạn tạm dừng Bot cho user ${userId}. Khôi phục Bot.`);
        handoverMap.delete(userId);
    }, durationMs);

    handoverMap.set(userId, {
        active: true,
        lastAdminActionTime: Date.now(),
        timer,
    });

    console.log(`[humanHandover]  Tạm dừng Bot tự động cho user ${userId} trong ${durationMs / 60000} phút.`);
}

/**
 * Tắt chế độ Nhân viên hỗ trợ (Bật lại Bot ngay lập tức).
 */
export function clearHandoverMode(userId: string): void {
    const existing = handoverMap.get(userId);
    if (existing?.timer) clearTimeout(existing.timer);
    handoverMap.delete(userId);
    console.log(`[humanHandover]  Đã bật lại Bot cho user ${userId}.`);
}
