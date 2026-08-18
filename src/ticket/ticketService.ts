import { ADMIN_PHONE_NUMBER } from "../config/adminConfig";

export interface Ticket {
    ticketCode: string;
    userId: string;
    roomNumber: string;
    deviceType: string;
    userText: string;
    createdAt: number;
}

const roomIssueCounters = new Map<string, number>();
const ticketStore = new Map<string, Ticket>();

/**
 * Tin nhắn hỏi lại (Slot Filling) khi người dùng báo sự cố chung chung chưa rõ tên thiết bị
 */
export const GENERAL_SLOT_FILLING_REPLY = `Dạ, trong quá trình sinh hoạt nếu có thiết bị gặp sự cố bạn cứ yên tâm nhé. Để đội kỹ thuật chuẩn bị vật tư hỗ trợ tốt nhất, bạn vui lòng cho em biết cụ thể **thiết bị nào đang gặp sự cố** (VD: máy lạnh không mát, vòi nước rò rỉ...) và **thời gian** kỹ thuật có thể qua nhé. Nếu có hình ảnh/video bạn cứ gửi trực tiếp vào đây ạ!`;

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
    deviceType: string = "Thiết bị trong phòng"
): Ticket {
    const validRoom = roomNumber && /^\d+$/.test(roomNumber) ? roomNumber : "Chưa xác định";
    const ticketCode = generateTicketCode(validRoom);

    const ticket: Ticket = {
        ticketCode,
        userId,
        roomNumber: validRoom,
        deviceType,
        userText,
        createdAt: Date.now(),
    };

    ticketStore.set(ticketCode, ticket);
    console.log(`[ticketService] Đã tạo thành công Ticket #${ticketCode} cho phòng ${validRoom}`);
    return ticket;
}

/**
 * Tạo tin nhắn xác nhận Ticket DUY NHẤT gửi cho Khách Hàng (End-User Interface)
 */
export function formatUserTicketMessage(ticket: Ticket): string {
    return `🎫 [PHIẾU BÁO SỰ CỐ - #${ticket.ticketCode}]
Dạ Quản gia AI đã khởi tạo Ticket bảo trì thành công!

📍 Số phòng: ${ticket.roomNumber}
🛠️ Thiết bị: ${ticket.deviceType}
📝 Nội dung: "${ticket.userText}"
📞 Hotline Kỹ thuật / Quản lý: ${ADMIN_PHONE_NUMBER}

Đội kỹ thuật của tòa nhà sẽ liên hệ xác nhận và qua hỗ trợ bạn trong thời gian sớm nhất ạ!`;
}

/**
 * Tạo tin nhắn thông báo Ticket DÀNH RIÊNG cho Admin / Ban quản lý (Chỉ gửi ngầm cho Admin)
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
