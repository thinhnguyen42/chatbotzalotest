import { generateRagReply } from "./rag/ragEngine";
import { classifyTopicAndReply } from "./topicEngine";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";

interface SpecialRule {
    match: (text: string, normText: string) => boolean;
    reply: string;
}

const SPECIAL_RULES: SpecialRule[] = [
    {
        match: (_t, norm) => /giờ mở cửa|gio mo cua|làm việc lúc mấy giờ|lam viec luc may gio/i.test(norm),
        reply: "Bên mình làm việc từ 8:00 - 21:00 tất cả các ngày trong tuần ạ.",
    },
    {
        // Nhận diện khi khách chỉ nhắn số phòng (vd: 101, phòng 101, P.101, phong 101)
        match: (t, norm) => /^(phòng\s*|phong\s*|p\.?\s*)?\d{3,4}$/i.test(t.trim()) || /^(phong\s*|p\.?\s*)?\d{3,4}$/i.test(norm.trim()),
        reply: "Dạ em đã ghi nhận số phòng của bạn. Em đang chuyển thông tin sang quản lý/chủ nhà để kiểm tra và hỗ trợ bạn ngay ạ!",
    },
];

export async function generateReply(userText: string): Promise<string> {
    const cleanText = splitUnspacedWords(normalizeTelexTypos(userText));
    const normText = removeVietnameseDiacritics(cleanText);

    // 1. Kiểm tra các quy tắc đặc biệt (ví dụ: số phòng)
    for (const rule of SPECIAL_RULES) {
        if (rule.match(userText, normText) || rule.match(cleanText, normText)) {
            return rule.reply;
        }
    }

    // 2. Phân loại theo Topic & Sub-branches với kỹ thuật xử lý lỗi chính tả/gõ phím (0 token LLM)
    const topicResult = classifyTopicAndReply(userText);
    if (topicResult.matched) {
        return topicResult.answer;
    }

    // 3. Fallback sang RAG / Microservices nếu chưa khớp topic trực tiếp
    return generateRagReply(userText);
}