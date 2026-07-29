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

const RULES: Rule[] = [
    {
        match: (t) => /xin ch(à|a)o|hello|hi\b/i.test(t),
        reply: "Chào bạn 👋 Mình có thể giúp gì cho bạn hôm nay?",
    },
    {
        match: (t) => /gi(á|a) c(ả|a)|bảng giá|price/i.test(t),
        reply: "Bạn cho mình xin tên sản phẩm/dịch vụ bạn quan tâm để mình báo giá nhé!",
    },
    {
        match: (t) => /giờ mở cửa|làm việc lúc mấy giờ/i.test(t),
        reply: "Bên mình làm việc từ 8:00 - 21:00 tất cả các ngày trong tuần ạ.",
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