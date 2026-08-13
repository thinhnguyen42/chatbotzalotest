/**
 * humanHandover.ts
 * ================
 * Quản lý trạng thái Chuyển Giao Người Thật (Human Handover Protocol):
 * 1. Tự động tạm dừng Bot khi Admin / Nhân viên gửi tin nhắn cho khách (Event: oa_send_text thủ công).
 * 2. Tự động tạm dừng Bot khi phát hiện Sự cố / Báo hỏng / Khẩn cấp để Admin tự hỗ trợ.
 * 3. Tự động khôi phục Bot sau HANDOVER_TIMEOUT_MS (5 phút không có tin nhắn mới từ Admin).
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

// Set chứa danh sách msg_id do chính Bot tự gửi qua API
const botSentMsgIds = new Set<string>();

/**
 * Đánh dấu 1 message_id là do Bot gửi (để phân biệt với Admin gửi từ Zalo OA Portal)
 */
export function markMsgIdAsBotSent(msgId: string): void {
    if (!msgId) return;
    botSentMsgIds.add(msgId);

    // Tự động xóa msg_id sau 10 phút để tránh tràn bộ nhớ
    setTimeout(() => {
        botSentMsgIds.delete(msgId);
    }, 10 * 60 * 1000);
}

/**
 * Kiểm tra xem message_id này có phải do chính Bot vừa gửi hay không
 */
export function isBotSentMsgId(msgId: string): boolean {
    if (!msgId) return false;
    return botSentMsgIds.has(msgId);
}

/**
 * Kiểm tra xem User này có đang trong chế độ Nhân viên hỗ trợ hay không.
 * @returns true nếu đang có nhân viên chăm sóc (Bot phải IM LẶNG)
 */
export function isHumanHandoverActive(userId: string): boolean {
    const state = handoverMap.get(userId);
    if (!state || !state.active) return false;

    // Check xem đã quá thời gian hết hạn chưa
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
