import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// Lưu tài liệu dạng raw text đơn giản trong RAM
interface KnowledgeChunk {
    text: string;
    source: string;
}

export class RagService {
    // Kho kiến thức lưu trong bộ nhớ (nâng cấp sang Vector DB sau)
    private static knowledgeBase: KnowledgeChunk[] = [];

    private static llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0.3,
        apiKey: process.env.GOOGLE_API_KEY,
    });

    /**
     * BƯỚC 1: Nạp tài liệu vào hệ thống (Nhận từ file Admin gửi)
     * @param rawText Nội dung văn bản của file PDF/TXT/Word
     * @param sourceName Tên file nguồn
     */
    static async ingestDocument(rawText: string, sourceName: string): Promise<number> {
        try {
            console.log(`[RAG] Đang chia nhỏ tài liệu: "${sourceName}"...`);

            // Chia tài liệu thành các đoạn ~1000 ký tự
            const chunkSize = 1000;
            const chunks: KnowledgeChunk[] = [];

            for (let i = 0; i < rawText.length; i += chunkSize) {
                chunks.push({
                    text: rawText.slice(i, i + chunkSize),
                    source: sourceName,
                });
            }

            this.knowledgeBase.push(...chunks);
            console.log(`[RAG] Đã nạp thành công ${chunks.length} chunks từ "${sourceName}"!`);
            return chunks.length;
        } catch (error) {
            console.error("[RAG] Lỗi khi nạp tài liệu:", error);
            throw error;
        }
    }

    /**
     * Lấy ngữ cảnh liên quan từ kho kiến thức (tìm kiếm đơn giản bằng keyword)
     */
    private static retrieveContext(question: string, topK = 3): string {
        if (this.knowledgeBase.length === 0) return "";

        const keywords = question.toLowerCase().split(/\s+/);

        // Tính điểm relevance đơn giản dựa trên số keyword khớp
        const scored = this.knowledgeBase.map(chunk => {
            const lowerText = chunk.text.toLowerCase();
            const score = keywords.filter(kw => lowerText.includes(kw)).length;
            return { chunk, score };
        });

        // Lấy topK đoạn liên quan nhất
        const topChunks = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(item => item.score > 0)
            .map(item => item.chunk.text);

        return topChunks.join("\n\n---\n\n");
    }

    /**
     * BƯỚC 2: Trả lời câu hỏi bằng Gemini
     * - Nếu có tài liệu → RAG (trả lời dựa trên tài liệu)
     * - Nếu chưa có tài liệu → Gemini thuần (trả lời tự nhiên)
     * @param userQuestion Câu hỏi của khách hàng
     */
    static async answerQuestion(userQuestion: string): Promise<string> {
        try {
            const context = this.retrieveContext(userQuestion);

            let prompt: ChatPromptTemplate;

            if (context) {
                // Có tài liệu → RAG mode
                console.log(`[RAG] Dùng RAG mode với ${this.knowledgeBase.length} chunks.`);
                prompt = ChatPromptTemplate.fromMessages([
                    ["system", `Bạn là trợ lý AI thông minh của cửa hàng trên Zalo OA.
Hãy trả lời câu hỏi của khách hàng CHỈ DỰA VÀO phần thông tin ngữ cảnh (Context) bên dưới.
Nếu trong ngữ cảnh không có thông tin, hãy nói: "Dạ shop chưa có thông tin chính xác về vấn đề này, để shop nhờ nhân viên CSKH liên hệ lại hỗ trợ bạn nhé!"
TUYỆT ĐỐI không tự bịa ra câu trả lời.
Xưng "shop", gọi khách là "bạn". Trả lời bằng tiếng Việt, ngắn gọn, thân thiện.

--- Ngữ cảnh (Context) ---
{context}
--------------------------`],
                    ["human", "{input}"],
                ]);

                const chain = prompt.pipe(this.llm);
                const response = await chain.invoke({ context, input: userQuestion });
                console.log("💡 [RAG] Đã tạo xong câu trả lời (RAG mode)!");
                return typeof response.content === "string" ? response.content : String(response.content);

            } else {
                // Chưa có tài liệu → Gemini thuần
                console.log("[AI] Dùng Gemini thuần (chưa có tài liệu).");
                prompt = ChatPromptTemplate.fromMessages([
                    ["system", `Bạn là trợ lý AI thân thiện của cửa hàng trên Zalo OA.
Hãy trả lời câu hỏi của khách hàng một cách tự nhiên, ngắn gọn và hữu ích.
Xưng "shop", gọi khách là "bạn". Trả lời bằng tiếng Việt.`],
                    ["human", "{input}"],
                ]);

                const chain = prompt.pipe(this.llm);
                const response = await chain.invoke({ input: userQuestion });
                console.log("💡 [AI] Đã tạo xong câu trả lời (Gemini mode)!");
                return typeof response.content === "string" ? response.content : String(response.content);
            }

        } catch (error) {
            console.error("[RAG] Lỗi:", error);
            return "Dạ hệ thống đang gặp sự cố, bạn đợi shop lát nhé!";
        }
    }

    /**
     * Kiểm tra trạng thái kho kiến thức
     */
    static getStats(): { chunks: number; sources: string[] } {
        const sources = [...new Set(this.knowledgeBase.map(c => c.source))];
        return { chunks: this.knowledgeBase.length, sources };
    }
}