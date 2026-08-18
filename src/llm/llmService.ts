import axios from "axios";
import { Message } from "../memory/sessionMemory";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const SYSTEM_PERSONA_PROMPT = `Bạn là Quản gia AI thân thiện và chuyên nghiệp của Tòa nhà / Căn hộ Dịch vụ.
Nhiệm vụ của bạn là giải đáp thắc mắc cho cư dân và khách thuê một cách lịch sự, ấm áp và ngắn gọn bằng tiếng Việt.

CÁC QUY TẮC BẮT BUỘC:
1. Chỉ được trả lời dựa trên thông tin được cung cấp trong phần TRUY VẤN TRI THỨC (Knowledge Base Context) dưới đây.
2. Không tự nghĩ ra thông tin hoặc bịa ra các quy định/chi phí không có trong tài liệu.
3. Nếu tài liệu không đề cập đủ thông tin để trả lời, hãy phản hồi khéo léo rằng bạn đã ghi nhận và thông báo nhân viên quản lý sẽ liên hệ hỗ trợ ngay.
4. Trả lời súc tích (dưới 150 từ), không dùng Markdown quá phức tạp (tránh dùng in đậm quá nhiều vì hiển thị trên Zalo mobile có thể khó đọc).
5. Nếu trong ngữ cảnh có thông tin Số phòng của khách, hãy xưng hô phù hợp (ví dụ: "Dạ em chào anh/chị ở phòng ...").`;

/**
 * Gọi Gemini API (Primary Provider - Gemini 2.5 Flash)
 */
async function callGeminiApi(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!GEMINI_API_KEY) {
        console.warn("[llmService] Chưa cấu hình GEMINI_API_KEY trong .env");
        return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axios.post(
            url,
            {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: userPrompt }],
                    },
                ],
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 500,
                },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 8000,
            }
        );

        const candidate = response.data?.candidates?.[0];
        const replyText = candidate?.content?.parts?.[0]?.text;

        if (replyText) {
            console.log("[llmService] Gọi Gemini API (Gemini 2.5 Flash) thành công!");
            return replyText.trim();
        }
        return null;
    } catch (err: any) {
        console.warn(`[llmService] Gọi Gemini API thất bại (status: ${err.response?.status || err.message}). Sẽ thử Provider dự phòng.`);
        return null;
    }
}

/**
 * Gọi Groq API (Backup Provider - groq/compound-mini)
 */
async function callGroqApi(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!GROQ_API_KEY) {
        console.warn("[llmService] Chưa cấu hình GROQ_API_KEY trong .env");
        return null;
    }

    const url = "https://api.groq.com/openai/v1/chat/completions";

    try {
        const response = await axios.post(
            url,
            {
                model: "groq/compound-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.3,
                max_tokens: 500,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 8000,
            }
        );

        const replyText = response.data?.choices?.[0]?.message?.content;
        if (replyText) {
            console.log("[llmService] Gọi Groq API (groq/compound-mini) dự phòng thành công!");
            return replyText.trim();
        }
        return null;
    } catch (err: any) {
        console.warn(`[llmService] Gọi Groq API thất bại: ${err.response?.status || err.message}`);
        return null;
    }
}

/**
 * Tổng hợp câu trả lời RAG thông minh kết hợp Ngữ cảnh tri thức & Lịch sử hội thoại
 */
export async function generateLlmAnswer(
    userText: string,
    history: Message[] = [],
    contextChunks: string[] = [],
    sessionContext?: { roomNumber?: string; userName?: string }
): Promise<string | null> {
    const kbContext = contextChunks.length > 0
        ? contextChunks.map((chunk, i) => `--- ĐOẠN TRI THỨC ${i + 1} ---\n${chunk}`).join("\n\n")
        : "Không tìm thấy dữ liệu tri thức trực tiếp.";

    let historyContext = "";
    if (history.length > 0) {
        historyContext = "LỊCH SỬ HỘI THOẠI GẦN ĐÂY:\n" +
            history.map((m) => `${m.role === "user" ? "Khách" : "Quản gia AI"}: ${m.content}`).join("\n");
    }

    let userInfoStr = "";
    if (sessionContext?.roomNumber) {
        userInfoStr += `Số phòng của khách: ${sessionContext.roomNumber}\n`;
    }
    if (sessionContext?.userName) {
        userInfoStr += `Tên của khách: ${sessionContext.userName}\n`;
    }

    const userPrompt = `
${userInfoStr ? `THÔNG TIN KHÁCH HÀNG:\n${userInfoStr}\n` : ""}
${historyContext ? `${historyContext}\n\n` : ""}
TRUY VẤN TRI THỨC (KNOWLEDGE BASE CONTEXT):
${kbContext}

CÂU HỎI MỚI NHẤT CỦA KHÁCH HÀNG:
"${userText}"

Hãy tổng hợp câu trả lời tự nhiên, lịch sự dựa trên thông tin trên:`;

    // 1. Thử gọi Gemini (Primary)
    let reply = await callGeminiApi(SYSTEM_PERSONA_PROMPT, userPrompt);
    if (reply) return reply;

    // 2. Dự phòng: Thử gọi Groq (Backup)
    reply = await callGroqApi(SYSTEM_PERSONA_PROMPT, userPrompt);
    if (reply) return reply;

    return null;
}
