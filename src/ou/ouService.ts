/**
 * OU STUDENT HANDBOOK SERVICE
 * Xử lý câu hỏi của sinh viên ĐH Mở về Quy chế, Học vụ, Học phí, Học bổng, Điểm rèn luyện.
 */

import { HandbookArticle, HANDBOOK_TOPICS, searchHandbookArticles, HANDBOOK_ARTICLES } from "./handbookData";
import { generateLlmAnswer } from "../llm/llmService";

export interface StudentAnswerResult {
    success: boolean;
    answer: string;
    matchedArticle?: HandbookArticle;
    topic?: string;
    quickReplies?: { title: string; payload: string }[];
}

/**
 * Xử lý câu hỏi của sinh viên
 */
export async function handleStudentQuestion(question: string, studentId?: string): Promise<StudentAnswerResult> {
    const rawText = (question || "").trim();
    if (!rawText) {
        return {
            success: false,
            answer: "Chào bạn! Tôi là Trợ lý Sổ tay Sinh viên OU. Bạn cần tra cứu thông tin gì về quy chế, học bổng, đăng ký học phần hay điểm rèn luyện?",
            quickReplies: [
                { title: "📚 Cảnh báo học vụ", payload: "Cảnh báo học vụ" },
                { title: "💰 Học bổng OU", payload: "Điều kiện xét học bổng" },
                { title: "📝 Rút học phần", payload: "Quy định rút môn" },
                { title: "🏛️ Phòng CTSV", payload: "Liên hệ phòng CTSV" },
            ],
        };
    }

    // 1. Chào hỏi thông thường
    const isGreeting = /^(xin chào|chào|hello|hi|chào bot|cho hỏi|alo)$/i.test(rawText);
    if (isGreeting) {
        const studentGreeting = studentId ? ` (MSSV: ${studentId})` : "";
        return {
            success: true,
            answer: `👋 Xin chào sinh viên${studentGreeting}!\nTôi là Trợ lý Ảo Sổ tay Sinh viên Đại học Mở (OU).\n\nBạn có thể hỏi tôi bất kỳ thông tin nào về:\n• Quy chế học vụ, GPA, Cảnh báo học vụ\n• Quy trình đăng ký môn, rút học phần\n• Điều kiện xét học bổng khuyến khích, gia hạn học phí\n• Điểm rèn luyện và Khung xếp loại\n• Thông tin liên hệ các Phòng ban (QLĐT, CTSV, Khảo thí)`,
            quickReplies: [
                { title: "📚 Cảnh báo học vụ", payload: "Cảnh báo học vụ" },
                { title: "💰 Học bổng OU", payload: "Điều kiện xét học bổng" },
                { title: "📝 Đăng ký môn", payload: "Quy trình đăng ký học phần" },
                { title: "⭐ Điểm rèn luyện", payload: "Khung điểm rèn luyện" },
            ],
        };
    }

    // 2. Tìm kiếm trong CSDL Sổ tay Sinh viên
    const matched = searchHandbookArticles(rawText);

    if (matched.length > 0) {
        const topArticle = matched[0];
        let answerText = `📖 [SỔ TAY SINH VIÊN OU] ${topArticle.title.toUpperCase()}\n\n`;
        answerText += `${topArticle.content}\n\n`;
        answerText += `💡 Nếu bạn có thắc mắc thêm về trường hợp cá nhân, vui lòng liên hệ Phòng Đào tạo (phongdaotao@ou.edu.vn) hoặc Phòng CTSV (ctsv@ou.edu.vn).`;

        // Gợi ý các chủ đề liên quan khác
        const otherSuggestions = matched.slice(1, 3).map((a) => ({
            title: a.title.length > 20 ? a.title.substring(0, 18) + "..." : a.title,
            payload: a.title,
        }));

        if (otherSuggestions.length === 0) {
            otherSuggestions.push(
                { title: "💰 Xét học bổng", payload: "Điều kiện xét học bổng" },
                { title: "🏛️ Liên hệ phòng ban", payload: "Danh bạ phòng ban" }
            );
        }

        return {
            success: true,
            answer: answerText,
            matchedArticle: topArticle,
            topic: topArticle.topic,
            quickReplies: otherSuggestions,
        };
    }

    // 3. Fallback AI (Gemini / Groq) nếu không khớp từ khóa trực tiếp
    try {
        const topArticles = matched.length > 0 ? matched : HANDBOOK_ARTICLES.slice(0, 3);
        const contextChunks = topArticles.map(a => `${a.title}:\n${a.content}`);
        const llmReply = await generateLlmAnswer(rawText, [], contextChunks);
        if (llmReply) {
            return {
                success: true,
                answer: `🎓 [Tư vấn Sinh viên OU]\n\n${llmReply}\n\n📌 Thông tin dựa trên Quy chế đào tạo Đại học Mở.`,
                quickReplies: [
                    { title: "📚 Quy chế học vụ", payload: "Quy chế học vụ" },
                    { title: "🏛️ Phòng ban liên hệ", payload: "Danh bạ phòng ban" },
                ],
            };
        }
    } catch (e: any) {
        console.warn("[ouService] LLM fallback error:", e.message);
    }

    // 4. Mặc định nếu không tìm thấy
    return {
        success: false,
        answer: `Hiện tại Trợ lý Sổ tay Sinh viên chưa tìm thấy thông tin chính xác cho câu hỏi: "${rawText}".\n\nBạn có thể thử chọn các chủ đề phổ biến bên dưới hoặc liên hệ Phòng Công tác Sinh viên (CTSV) qua email: ctsv@ou.edu.vn để được hỗ trợ trực tiếp.`,
        quickReplies: [
            { title: "📚 Cảnh báo học vụ", payload: "Cảnh báo học vụ" },
            { title: "💰 Học bổng OU", payload: "Điều kiện xét học bổng" },
            { title: "📝 Rút học phần", payload: "Quy định rút môn" },
            { title: "🏛️ Phòng ban hỗ trợ", payload: "Danh bạ phòng ban" },
        ],
    };
}
