import { getEmbedding } from "./embeddings";
import { queryStore } from "./vectorStore";
import { searchBm25 } from "./bm25Search";
import { findDirectFaqMatch } from "./faqParser";
import { matchFaqWithPhoBert } from "./phobertClient";
import { matchFaqWithViEncoder } from "./viEncoderClient";
import { generateLlmAnswer } from "../llm/llmService";
import { getSession, getRecentHistory } from "../memory/sessionMemory";
import { expandVietnameseAbbreviations } from "../utils/synonymUtils";

const SIMILARITY_THRESHOLD = parseFloat(
    process.env.RAG_SIMILARITY_THRESHOLD || "0.85"
);
const TOP_K = 4;

function cleanMarkdownText(text: string): string {
    if (!text) return text;
    return text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/^\s*\*[\s]+/gm, "- ")
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
    const match = chunkText.match(/Chatbot\s*(?:trả lời)?:([\s\S]*)/i);
    let answer = match ? match[1] : chunkText;
    return cleanMarkdownText(answer.trim());
}

export async function generateRagReply(userText: string, userId: string = "default_user"): Promise<string> {
    const trimmed = userText.trim();

    // 0. Mở rộng các từ viết tắt và từ đồng nghĩa tiếng Việt chuyên dùng cho căn hộ
    const expandedText = expandVietnameseAbbreviations(userText);
    console.log(`[ragEngine] Expanded Query: "${userText}" -> "${expandedText}"`);

    // 1. Thử tìm câu trả lời chính xác bằng thuật toán từ khóa từ KB
    const directMatch = findDirectFaqMatch(userText) || findDirectFaqMatch(expandedText);
    if (directMatch) {
        console.log(`[ragEngine] Khớp từ khóa trực tiếp từ KB cho câu: "${userText}"`);
        return cleanMarkdownText(directMatch);
    }

    if (trimmed.length <= 1 || /^\d{1,2}$/.test(trimmed)) {
        return DEFAULT_UNKNOWN_REPLY;
    }

    // 2. Thử Vietnamese Bi-Encoder Semantic FAQ matching (port 5051)
    try {
        const viResult = await matchFaqWithViEncoder(expandedText);
        if (viResult?.matched) {
            console.log(
                `[ragEngine] Vi-Encoder match: "${viResult.topic}" ` +
                `(score=${viResult.score.toFixed(3)}) for: "${expandedText}"`
            );
            return cleanMarkdownText(viResult.answer);
        }
    } catch (err: any) {
        console.warn("[ragEngine] Vi-Encoder lookup failed:", err.message);
    }

    // 3. Thử PhoBERT semantic FAQ matching (port 5050)
    try {
        const phobertResult = await matchFaqWithPhoBert(expandedText);
        if (phobertResult?.matched) {
            console.log(
                `[ragEngine] PhoBERT match: "${phobertResult.topic}" ` +
                `(score=${phobertResult.score.toFixed(3)}) for: "${expandedText}"`
            );
            return cleanMarkdownText(phobertResult.answer);
        }
    } catch (err: any) {
        console.warn("[ragEngine] PhoBERT lookup failed:", err.message);
    }

    // 4. HYBRID SEARCH (KẾT HỢP VECTOR DENSE + BM25 KEYWORD SEARCH)
    let vectorResults: any[] = [];
    try {
        const queryEmbedding = await getEmbedding(expandedText, "RETRIEVAL_QUERY");
        vectorResults = queryStore(queryEmbedding, TOP_K * 2);
    } catch (err: any) {
        console.warn("[ragEngine] Lỗi query Vector Store:", err.message);
    }

    const bm25Results = searchBm25(expandedText, TOP_K * 2);

    // Trộn điểm Hybrid Score: 60% Vector + 40% BM25
    const chunkMap = new Map<string, { chunk: any; vectorScore: number; bm25Score: number }>();

    for (const v of vectorResults) {
        chunkMap.set(v.chunk.id, { chunk: v.chunk, vectorScore: v.score, bm25Score: 0 });
    }

    for (const b of bm25Results) {
        const existing = chunkMap.get(b.chunk.id);
        if (existing) {
            existing.bm25Score = b.score;
        } else {
            chunkMap.set(b.chunk.id, { chunk: b.chunk, vectorScore: 0, bm25Score: b.score });
        }
    }

    const hybridScored = Array.from(chunkMap.values()).map((item) => ({
        chunk: item.chunk,
        hybridScore: 0.6 * item.vectorScore + 0.4 * item.bm25Score,
        vectorScore: item.vectorScore,
        bm25Score: item.bm25Score,
    }));

    hybridScored.sort((a, b) => b.hybridScore - a.hybridScore);

    const bestHybridScore = hybridScored[0]?.hybridScore ?? 0;
    console.log(`[ragEngine] Hybrid Search best score: ${bestHybridScore.toFixed(3)} (Vector: ${hybridScored[0]?.vectorScore.toFixed(3) || 0}, BM25: ${hybridScored[0]?.bm25Score.toFixed(3) || 0})`);

    // Chuẩn bị danh sách các đoạn tài liệu tìm thấy theo thứ tự xếp hạng Hybrid
    const contextChunks = hybridScored.slice(0, TOP_K).map((item) => item.chunk.text);

    // Lấy thông tin Session Memory của người dùng
    const session = getSession(userId);
    const history = getRecentHistory(userId, 6);
    const sessionContext = { roomNumber: session.roomNumber, userName: session.userName };

    // 5. Thử Tổng hợp câu trả lời bằng LLM (Gemini / Groq Failover)
    if (contextChunks.length > 0 && bestHybridScore >= 0.4) {
        try {
            console.log(`[ragEngine] Thử tổng hợp câu trả lời bằng LLM (contextChunks: ${contextChunks.length})...`);
            const llmReply = await generateLlmAnswer(userText, history, contextChunks, sessionContext);
            if (llmReply) {
                return cleanMarkdownText(llmReply);
            }
        } catch (err: any) {
            console.warn(`[ragEngine] LLM Synthesis failed: ${err.message}`);
        }
    }

    // 6. Trích xuất trực tiếp câu trả lời chuẩn từ Chunk có điểm cao nhất nếu LLM API không có sẵn
    if (hybridScored.length > 0 && bestHybridScore >= SIMILARITY_THRESHOLD) {
        return extractAnswerFromChunk(hybridScored[0].chunk.text);
    }

    // 7. Fallback cuối cùng
    return DEFAULT_UNKNOWN_REPLY;
}