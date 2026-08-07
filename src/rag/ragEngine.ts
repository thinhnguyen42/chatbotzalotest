import { getEmbedding } from "./embeddings";
import { queryStore } from "./vectorStore";
import { findDirectFaqMatch } from "./faqParser";
import { matchFaqWithPhoBert } from "./phobertClient";
import { matchFaqWithBgeM3 } from "./bgeM3Client";

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

const DEFAULT_UNKNOWN_REPLY = `Quản gia AI thông báo:
Dạ, câu hỏi này nằm ngoài phạm vi dữ liệu hiện tại của em rồi ạ. 

Hỗ trợ gấp: Bấm gọi ngay Hotline Quản lý tòa nhà: 0938244695 nếu cần xử lý gấp nhé! Nhân viên cũng đang vào check tin nhắn để rep bạn liền ạ.

Thông tin tra cứu nhanh: Hiện tại em có thể hỗ trợ bạn ngay các thông tin sau. Bạn chỉ cần gõ trực tiếp các từ khóa dưới đây, em sẽ gửi phản hồi lập tức:
- [Địa chỉ] - Xem vị trí chính xác của tòa nhà.
- [Chi phí] - Xem tiền điện, nước, phí dịch vụ hằng tháng.
- [Nội quy nhà] - Xem quy định giờ giấc, bạn bè, nuôi pet.
- [PCCC] - Hướng dẫn an toàn phòng cháy chữa cháy.
- [Bảo trì] - Báo sự cố hư hỏng trang thiết bị trong phòng.
- [Liên hệ] - Lấy số hotline ban quản lý tòa nhà.

Bạn đợi bên em một xíu xiu nhé, nhân viên sẽ hỗ trợ bạn ngay đây ạ!`;

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

    // 1. Thử tìm câu trả lời chính xác bằng thuật toán từ khóa từ KB (tốc độ 0ms, 100% chuẩn kịch bản)
    const directMatch = findDirectFaqMatch(userText);
    if (directMatch) {
        console.log(`[ragEngine] Khớp từ khóa trực tiếp từ KB cho câu: "${userText}"`);
        return cleanMarkdownText(directMatch);
    }

    // 2. Thử BGE-M3 Multilingual SOTA Semantic FAQ matching (port 5051)
    try {
        const bgeM3Result = await matchFaqWithBgeM3(userText);
        if (bgeM3Result?.matched) {
            console.log(
                `[ragEngine] BGE-M3 match: "${bgeM3Result.topic}" ` +
                `(score=${bgeM3Result.score.toFixed(3)}) for: "${userText}"`
            );
            return cleanMarkdownText(bgeM3Result.answer);
        }
        if (bgeM3Result) {
            console.log(
                `[ragEngine] BGE-M3 best score ${bgeM3Result.score.toFixed(3)} below threshold, ` +
                `trying PhoBERT.`
            );
        }
    } catch (err: any) {
        console.warn("[ragEngine] BGE-M3 lookup failed:", err.message);
    }

    // 3. Thử PhoBERT semantic FAQ matching (Vietnamese-optimised, port 5050)
    try {
        const phobertResult = await matchFaqWithPhoBert(userText);
        if (phobertResult?.matched) {
            console.log(
                `[ragEngine] PhoBERT match: "${phobertResult.topic}" ` +
                `(score=${phobertResult.score.toFixed(3)}) for: "${userText}"`
            );
            return cleanMarkdownText(phobertResult.answer);
        }
        if (phobertResult) {
            console.log(
                `[ragEngine] PhoBERT best score ${phobertResult.score.toFixed(3)} below threshold, ` +
                `falling back to Gemini vector search.`
            );
        }
    } catch (err: any) {
        console.warn("[ragEngine] PhoBERT lookup failed:", err.message);
    }

    // 4. Nếu không khớp BGE-M3 / PhoBERT -> Tìm kiếm theo Vector Store Similarity (Gemini Embeddings / RAG)
    let results;
    try {
        const queryEmbedding = await getEmbedding(userText, "RETRIEVAL_QUERY");
        results = queryStore(queryEmbedding, TOP_K);
    } catch (err: any) {
        console.warn("[ragEngine] Lỗi query KB:", err.message);
        return DEFAULT_UNKNOWN_REPLY;
    }

    const bestScore = results[0]?.score ?? 0;
    console.log(`[ragEngine] Gemini best match score: ${bestScore.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);

    if (results.length === 0 || bestScore < SIMILARITY_THRESHOLD) {
        // Không tìm thấy nội dung đủ liên quan trong KB -> Trả về form menu hỗ trợ mặc định
        return DEFAULT_UNKNOWN_REPLY;
    }

    // 5. Trích xuất trực tiếp câu trả lời chuẩn từ Chunk có điểm số cao nhất
    return extractAnswerFromChunk(results[0].chunk.text);
}