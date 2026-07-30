import axios from "axios";
import { getEmbedding } from "./embeddings";
import { queryStore } from "./vectorStore";
import { findDirectFaqMatch } from "./faqParser";

/**
 * Ngưỡng similarity để quyết định "có tìm thấy trong KB hay không".
 * Cosine similarity nằm trong khoảng [-1, 1], thường 0.7+ là khá liên quan.
 * Chỉnh ngưỡng này qua .env (RAG_SIMILARITY_THRESHOLD) nếu bot trả lời
 * sai (quá dễ dãi -> tăng ngưỡng, quá "không biết" -> giảm ngưỡng).
 */
const SIMILARITY_THRESHOLD = parseFloat(
    process.env.RAG_SIMILARITY_THRESHOLD || "0.85"
);
const TOP_K = 4;

function cleanMarkdownText(text: string): string {
    if (!text) return text;
    return text
        // Xóa in đậm Markdown **text** -> text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        // Đổi các dấu gạch đầu dòng dạng * thành - 
        .replace(/^\s*\*[\s]+/gm, "- ")
        // Xóa in nghiêng Markdown *text* -> text
        .replace(/\*(.*?)\*/g, "$1")
        .trim();
}

const DEFAULT_UNKNOWN_REPLY = `Xin lỗi, mình chưa hiểu rõ yêu cầu của bạn.
Bạn có thể nhập từ khóa cần hỗ trợ dưới đây ạ:
🔹 Dịch vụ
🔹 Bảng giá
🔹 Khuyến mãi
🔹 Đặt lịch
🔹 Liên hệ
🔹 Hướng dẫn
🔹 Bảo hành
🔹 Hỗ trợ
🔹 Địa chỉ`;

function extractAnswerFromChunk(chunkText: string): string {
    if (!chunkText) return "";

    // Tìm đoạn trả lời sau "Chatbot:" trong chunk
    const match = chunkText.match(/Chatbot\s*(?:trả lời)?:([\s\S]*)/i);
    let answer = match ? match[1] : chunkText;

    return cleanMarkdownText(answer.trim());
}

export async function generateRagReply(userText: string): Promise<string> {
    const trimmed = userText.trim();

    // Nếu tin nhắn quá ngắn (1-2 ký tự hoặc chỉ là chữ số đơn lẻ như 0, 1, 2...) -> Trả về form menu mặc định ngay
    if (trimmed.length <= 2 || /^\d{1,2}$/.test(trimmed)) {
        return DEFAULT_UNKNOWN_REPLY;
    }

    // 1. Thử tìm câu trả lời chính xác bằng thuật toán từ khóa từ KB (tốc độ 0ms, 100% chuẩn kịch bản, không rò rỉ prompt AI)
    const directMatch = findDirectFaqMatch(userText);
    if (directMatch) {
        console.log(`[ragEngine] Khớp từ khóa trực tiếp từ KB cho câu: "${userText}"`);
        return cleanMarkdownText(directMatch);
    }

    // 2. Nếu không khớp từ khóa trực tiếp -> Tìm kiếm theo Vector Store Similarity (RAG)
    let results;
    try {
        const queryEmbedding = await getEmbedding(userText, "RETRIEVAL_QUERY");
        results = queryStore(queryEmbedding, TOP_K);
    } catch (err: any) {
        console.warn("[ragEngine] Lỗi query KB:", err.message);
        return DEFAULT_UNKNOWN_REPLY;
    }

    const bestScore = results[0]?.score ?? 0;
    console.log(`[ragEngine] Best match score: ${bestScore.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);

    if (results.length === 0 || bestScore < SIMILARITY_THRESHOLD) {
        // Không tìm thấy nội dung đủ liên quan trong KB -> Trả về form menu hỗ trợ mặc định
        return DEFAULT_UNKNOWN_REPLY;
    }

    // 3. Trích xuất trực tiếp câu trả lời chuẩn từ Chunk có điểm số cao nhất
    return extractAnswerFromChunk(results[0].chunk.text);
}