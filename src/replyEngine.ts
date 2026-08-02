import { generateRagReply } from "./rag/ragEngine";

/**
 * Chiến lược 3 tầng:
 * 1. Rule-based trước (nhanh, rẻ, kiểm soát được nội dung)
 * 2. Nếu không match rule -> tìm trong Knowledge Base (RAG)
 * 3. Nếu KB không có gì đủ liên quan -> AI trả lời tự do
 *
 * Bạn tự do sửa RULES bên dưới theo domain của mình
 * (vd: hỏi giá, hỏi giờ mở cửa, hỏi địa chỉ...)
 */

interface Rule {
    match: (text: string) => boolean;
    reply: string;
}

const GREETING_REPLY = `Xin chào bạn! Quản gia AI của SunHavens rất vui được hỗ trợ bạn. 🥰

Hiện tại, bạn đang quan tâm đến thông tin nào của căn hộ ạ? Bạn có thể gõ trực tiếp các từ khóa này để em gửi thông tin ngay lập tức nhé:
📍 [Địa chỉ] – Xem vị trí chính xác của tòa nhà.
💰 [Chi phí] – Xem tiền điện, nước, phí dịch vụ hằng tháng.
📜 [Nội quy nhà] – Xem quy định giờ giấc, bạn bè, nuôi pet.
🔥 [PCCC] – Hướng dẫn an toàn phòng cháy chữa cháy.
🛠️ [Bảo trì] – Báo sự cố hư hỏng trang thiết bị trong phòng.
📞 [Liên hệ] – Lấy số hotline ban quản lý tòa nhà.

Nếu bạn có câu hỏi khác, cứ nhắn trực tiếp vào đây, em sẽ hỗ trợ bạn ngay nha!`;

const RULES: Rule[] = [
    {
        // Nhận diện mọi cách chào và từ khóa "hỗ trợ", "trợ giúp", "help"
        match: (t) => /^(xin chào|chào|chào bot|hello|hi|heluu|chào bạn|chao|hii+|chào em|chào ad|hỗ trợ|trợ giúp|help)\b/i.test(t.trim()) || /^(hỗ trợ|trợ giúp|help)$/i.test(t.trim()),
        reply: GREETING_REPLY,
    },
    {
        match: (t) => /giờ mở cửa|làm việc lúc mấy giờ/i.test(t),
        reply: "Bên mình làm việc từ 8:00 - 21:00 tất cả các ngày trong tuần ạ.",
    },
    {
        // Nhận diện khi khách chỉ nhắn số phòng (vd: 101, phòng 101, P.101)
        match: (t) => /^(phòng\s*|p\.?\s*)?\d{3,4}$/i.test(t.trim()),
        reply: "Dạ em đã ghi nhận số phòng của bạn. Em đang chuyển thông tin sang quản lý/chủ nhà để kiểm tra và hỗ trợ bạn ngay ạ! 😊",
    },
    // Thêm rule mới ở đây...
];

function tryRuleBasedReply(text: string): string | null {
    for (const rule of RULES) {
        if (rule.match(text)) return rule.reply;
    }
    return null;
}

export async function generateReply(userText: string): Promise<string> {
    const ruleReply = tryRuleBasedReply(userText);
    if (ruleReply) return ruleReply;

    return generateRagReply(userText);
}