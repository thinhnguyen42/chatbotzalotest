import { ADMIN_PHONE_NUMBER } from "../config/adminConfig";

export interface Ticket {
    ticketCode: string;
    userId: string;
    roomNumber: string;
    deviceType: string;
    userText: string;
    createdAt: number;
    preferredTime?: string;
    phone?: string;
}

const roomIssueCounters = new Map<string, number>();
const ticketStore = new Map<string, Ticket>();

/**
 * Tin nhắn mẫu thông tin báo sự cố kèm ví dụ minh họa
 */
export const INCIDENT_FORM_TEMPLATE_REPLY = `Dạ, Quản gia AI đã nhận được yêu cầu báo sự cố của bạn!

Để đội kỹ thuật chuẩn bị vật tư và đến hỗ trợ nhanh nhất, bạn vui lòng nhắn lại theo mẫu dưới đây giúp em nhé:

📋 MẪU THÔNG TIN BÁO SỰ CỐ:
• Số phòng: [Nhập số phòng]
• Thiết bị / Sự cố: [Mô tả thiết bị hỏng]
• Thời gian hỗ trợ: [Khung giờ kỹ thuật qua]
• Số điện thoại: [SĐT liên hệ]

💡 MẪU TIN NHẮN MẪU (Bạn có thể copy & sửa lại):
1️⃣ "Phòng 302 hỏng điều hòa không mát, kỹ thuật qua lúc 14h chiều nay, SĐT 0912345678"
2️⃣ "Phòng 101 rò rỉ vòi nước phòng tắm, rảnh sáng mai 9h, SĐT 0987654321"
3️⃣ "Phòng 405 cháy bóng đèn phòng khách, qua lúc nào cũng được, SĐT 0905123456"`;

/**
 * Tin nhắn hỏi lại (Slot Filling) khi người dùng báo sự cố chung chung chưa rõ tên thiết bị
 */
export const GENERAL_SLOT_FILLING_REPLY = INCIDENT_FORM_TEMPLATE_REPLY;

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
    deviceType: string = "Thiết bị trong phòng",
    preferredTime?: string,
    phone?: string
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
        preferredTime,
        phone,
    };

    ticketStore.set(ticketCode, ticket);
    console.log(`[ticketService] Đã tạo thành công Ticket #${ticketCode} cho phòng ${validRoom}`);
    return ticket;
}

/**
 * Tạo tin nhắn xác nhận Ticket gửi cho Khách Hàng (End-User Interface)
 */
export function formatUserTicketMessage(ticket: Ticket): string {
    const roomStr = ticket.roomNumber !== "000" && ticket.roomNumber !== "Chưa xác định"
        ? ticket.roomNumber
        : "Chưa xác định";
    const timeStr = ticket.preferredTime || "Trong giờ hành chính";
    const phoneStr = ticket.phone || "Chưa cung cấp";

    return `Dạ, Quản gia AI đã ghi nhận yêu cầu báo sự cố của bạn!

🎫 Mã phiếu hỗ trợ: #${ticket.ticketCode}
• Số phòng: ${roomStr}
• Thiết bị / Sự cố: ${ticket.deviceType}
• Thời gian hỗ trợ: ${timeStr}
• Số điện thoại: ${phoneStr}

Đội kỹ thuật của tòa nhà sẽ liên hệ xác nhận thông tin với bạn để hỗ trợ xử lý ạ.
📞 Hotline Kỹ thuật / Quản lý: ${ADMIN_PHONE_NUMBER}`;
}

/**
 * Tạo tin nhắn thông báo Ticket DÀNH RIÊNG cho Admin / Ban quản lý (Chỉ gửi ngầm cho Admin)
 */
export function formatAdminTicketMessage(ticket: Ticket): string {
    const timeCreated = new Date(ticket.createdAt).toLocaleString("vi-VN");
    const prefTime = ticket.preferredTime || "Trong giờ hành chính";
    const phoneStr = ticket.phone || "Chưa cung cấp";

    return `🛠️ [TICKET SỰ CỐ MỚI #${ticket.ticketCode} - CẦN XỬ LÝ]
• Mã ticket: #${ticket.ticketCode}
• Khách hàng (Zalo User ID): ${ticket.userId}
• Số phòng: ${ticket.roomNumber}
• Thiết bị: ${ticket.deviceType}
• Nội dung báo: "${ticket.userText}"
• Thời gian hỗ trợ mong muốn: ${prefTime}
• Số điện thoại liên hệ: ${phoneStr}
• Thời gian tạo: ${timeCreated}`;
}
