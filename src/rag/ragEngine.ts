import axios from "axios";
import { getEmbedding } from "./embeddings";
import { queryStore } from "./vectorStore";

/**
 * Ngưỡng similarity để quyết định "có tìm thấy trong KB hay không".
 * Cosine similarity nằm trong khoảng [-1, 1], thường 0.7+ là khá liên quan.
 * Chỉnh ngưỡng này qua .env (RAG_SIMILARITY_THRESHOLD) nếu bot trả lời
 * sai (quá dễ dãi -> tăng ngưỡng, quá "không biết" -> giảm ngưỡng).
 */
const SIMILARITY_THRESHOLD = parseFloat(
    process.env.RAG_SIMILARITY_THRESHOLD || "0.7"
);
const TOP_K = 3;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const CHAT_MODEL = "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * enableSearch = true -> bật Google Search grounding, Gemini sẽ tự động
 * tìm kiếm trên web khi cần để trả lời chính xác, cập nhật thông tin mới.
 * Chỉ nên bật ở nhánh "không tìm thấy trong KB" - nhánh trả lời DỰA TRÊN
 * KB thì không cần (đã có context rồi, bật thêm dễ khiến model trộn lẫn
 * nguồn, tốn thêm chi phí mỗi lần gọi có search).
 */
async function callGemini(prompt: string, enableSearch: boolean = false): Promise<string> {
    if (!GEMINI_API_KEY) {
        return "Xin lỗi, hiện mình chưa hiểu câu hỏi này. Bạn vui lòng nhắn lại rõ hơn giúp mình nhé!";
    }

    try {
        const body: any = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        if (enableSearch) {
            body.tools = [{ google_search: {} }];
        }

        const res = await axios.post(
            `${BASE_URL}/models/${CHAT_MODEL}:generateContent`,
            body,
            {
                headers: {
                    "x-goog-api-key": GEMINI_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );

        const candidate = res.data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        // Log các câu Gemini đã search (nếu có) - hữu ích để debug/theo dõi chi phí
        const searchQueries = candidate?.groundingMetadata?.webSearchQueries;
        if (searchQueries?.length) {
            console.log("[ragEngine] Gemini đã search:", searchQueries.join(", "));
        }

        return text || "Xin lỗi, mình chưa trả lời được câu này.";
    } catch (err: any) {
        console.error("[ragEngine] Lỗi gọi Gemini:", err.response?.data || err.message);
        return "Xin lỗi, hệ thống đang bận. Bạn thử lại sau ít phút nhé!";
    }
}

export async function generateRagReply(userText: string): Promise<string> {
    // Nếu chưa ingest KB (chưa có GEMINI_API_KEY hoặc store rỗng), bỏ qua RAG luôn
    let results;
    try {
        const queryEmbedding = await getEmbedding(userText, "RETRIEVAL_QUERY");
        results = queryStore(queryEmbedding, TOP_K);
    } catch (err: any) {
        console.warn("[ragEngine] Không query được KB, chuyển sang AI trả lời tự do:", err.message);
        return callGemini(
            `Bạn là trợ lý chăm sóc khách hàng qua Zalo OA, trả lời ngắn gọn, thân thiện, tiếng Việt. Câu hỏi của khách: "${userText}"`,
            true // bật search vì không có context nào để dựa vào
        );
    }

    const bestScore = results[0]?.score ?? 0;
    console.log(`[ragEngine] Best match score: ${bestScore.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);

    if (results.length === 0 || bestScore < SIMILARITY_THRESHOLD) {
        // Không tìm thấy gì đủ liên quan trong KB -> để AI trả lời tự do,
        // bật Google Search để có thông tin thực tế/cập nhật thay vì chỉ đoán
        return callGemini(
            `Bạn là trợ lý chăm sóc khách hàng qua Zalo OA, trả lời ngắn gọn, thân thiện, tiếng Việt. Nếu cần, hãy tìm kiếm thông tin thực tế để trả lời chính xác. Câu hỏi của khách: "${userText}"`,
            true
        );
    }

    // Có nội dung liên quan trong KB -> bắt AI trả lời DỰA TRÊN context này,
    // không bật search để tránh trộn nguồn ngoài KB
    const context = results.map((r) => r.chunk.text).join("\n---\n");

    const prompt = `Bạn là trợ lý chăm sóc khách hàng qua Zalo OA. Dựa CHÍNH XÁC vào thông tin tham khảo dưới đây để trả lời câu hỏi của khách, ngắn gọn, thân thiện, tiếng Việt. Nếu thông tin tham khảo không đủ để trả lời chính xác, hãy nói rõ là bạn sẽ chuyển cho nhân viên hỗ trợ thêm, không tự bịa thông tin.

Thông tin tham khảo:
${context}

Câu hỏi của khách: "${userText}"`;

    return callGemini(prompt, false);
}