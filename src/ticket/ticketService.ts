import { ADMIN_PHONE_NUMBER } from "../config/adminConfig";

export interface Ticket {
    ticketCode: string;
    userId: string;
    roomNumber: string;
    deviceType?: string;
    userText: string;
    createdAt: number;
}

// Lưu trữ đếm số lượng issue theo phòng để tạo ticketCode (vd: tk401001, tk401002)
const roomIssueCounters = new Map<string, number>();
const ticketStore = new Map<string, Ticket>();

export const ISSUE_GUIDANCE_TEMPLATE = `Dạ, trong quá trình sinh hoạt, nếu các trang thiết bị trong phòng (điện, nước, máy lạnh, tủ lạnh...) gặp sự cố, bạn cứ yên tâm nhé.
Bạn vui lòng gửi thông tin cho Quản gia AI theo cú pháp sau để em báo đội kỹ thuật qua xử lý ngay ạ:
- Thiết bị gặp sự cố: [Tên thiết bị, ví dụ: Máy lạnh không mát / Vòi nước bị rò rỉ]
- Hình ảnh/Video (nếu có): [Bạn gửi kèm vào khung chat này nhé]
- Thời gian kỹ thuật có thể qua: [Ví dụ: Sáng mai / Cả ngày / Sau 18h]
Đội kỹ thuật của tòa nhà sẽ liên hệ xác nhận thông tin trong thời gian sớm nhất ạ!`;

/**
 * Sinh mã Ticket theo định dạng: tk<số_phòng><số_thứ_tự_sự_cố>
 * Ví dụ: Phòng 401, sự cố đầu tiên -> tk401001
 */
export function generateTicketCode(roomNumber?: string): string {
    const validRoom = roomNumber && /^\d+$/.test(roomNumber) ? roomNumber : "000";
    const currentCount = (roomIssueCounters.get(validRoom) || 0) + 1;
    roomIssueCounters.set(validRoom, currentCount);

    const seqStr = String(currentCount).padStart(3, "0");
    return `tk${validRoom}${seqStr}`;
}

/**
 * Tạo một Ticket sự cố mới và lưu trữ vào Ticket Store
 */
export function createTicket(
    userId: string,
    roomNumber?: string,
    userText: string = "",
    deviceType?: string
): Ticket {
    const validRoom = roomNumber && /^\d+$/.test(roomNumber) ? roomNumber : "000";
    const ticketCode = generateTicketCode(validRoom);

    const ticket: Ticket = {
        ticketCode,
        userId,
        roomNumber: validRoom,
        deviceType: deviceType || "Sự cố kỹ thuật",
        userText,
        createdAt: Date.now(),
    };

    ticketStore.set(ticketCode, ticket);
    console.log(`[ticketService] Đã tạo thành công Ticket #${ticketCode} cho phòng ${validRoom}`);
    return ticket;
}

/**
 * Tạo tin nhắn xác nhận Ticket gửi cho Khách Hàng
 */
export function formatUserTicketMessage(ticket: Ticket): string {
    return `🎟️ [PHIẾU BÁO SỰ CỐ - #${ticket.ticketCode}]
Dạ Quản gia AI đã khởi tạo Ticket bảo trì thành công!

📍 Số phòng: ${ticket.roomNumber}
🛠️ Thiết bị: ${ticket.deviceType}
📝 Nội dung: "${ticket.userText}"
📞 Hotline Kỹ thuật / Quản lý: ${ADMIN_PHONE_NUMBER}

Đội kỹ thuật của tòa nhà sẽ liên hệ xác nhận và qua hỗ trợ bạn trong thời gian sớm nhất ạ!`;
}

/**
 * Tạo tin nhắn báo Ticket gửi cho Admin / Ban quản lý
 */
export function formatAdminTicketMessage(ticket: Ticket): string {
    const timeStr = new Date(ticket.createdAt).toLocaleString("vi-VN");
    return `🛠️ [TICKET SỰ CỐ MỚI #${ticket.ticketCode} - CẦN XỬ LÝ]
Khách hàng ID: ${ticket.userId}
Số phòng: ${ticket.roomNumber}
Thiết bị: ${ticket.deviceType}
Nội dung báo: "${ticket.userText}"
Hotline liên hệ Admin: ${ADMIN_PHONE_NUMBER}
Thời gian tạo: ${timeStr}`;
}
