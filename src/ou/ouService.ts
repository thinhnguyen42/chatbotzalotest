/**
 * OU STUDENT HANDBOOK SERVICE
 * Xử lý câu hỏi của sinh viên ĐH Mở TP.HCM theo Sổ tay Sinh viên (QĐ 2289/QĐ-ĐHM).
 */

import { HandbookArticle, HANDBOOK_TOPICS, HANDBOOK_ARTICLES, searchHandbookArticles } from "./handbookData";
import { generateLlmAnswer } from "../llm/llmService";
import { removeVietnameseDiacritics } from "../utils/textUtils";

export interface StudentAnswerResult {
    success: boolean;
    answer: string;
    matchedArticle?: HandbookArticle;
    topic?: string;
    quickReplies?: { title: string; payload: string }[];
}

const OU_SYSTEM_PROMPT = `Bạn là Trợ lý Ảo Sổ tay Sinh viên của Trường Đại học Mở Thành phố Hồ Chí Minh (OU).
Nhiệm vụ của bạn là giải đáp thắc mắc của sinh viên một cách thân thiện, rõ ràng, chính xác bằng tiếng Việt dựa trên Sổ tay Sinh viên ĐH Mở TP.HCM.

CÁC QUY TẮC BẮT BUỘC:
1. Chỉ được trả lời dựa trên thông tin được cung cấp trong phần TRUY VẤN TRI THỨC (Knowledge Base Context) dưới đây.
2. Không tự nghĩ ra hoặc bịa ra quy định, mức điểm, mức phí hay email/số điện thoại không có trong tài liệu.
3. Nếu tài liệu không đề cập đủ thông tin, hãy khéo léo hướng dẫn sinh viên liên hệ Phòng Quản lý đào tạo (quanlydaotao@ou.edu.vn) hoặc Phòng Công tác Sinh viên và Truyền thông (osa@ou.edu.vn - Hotline: (028) 39330660).
4. Trả lời súc tích (dưới 180 từ), rõ ý, dễ đọc trên Zalo mobile.`;

const DEFAULT_QUICK_REPLIES = [
    { title: "📚 Cảnh báo học vụ", payload: "Cảnh báo học tập" },
    { title: "📝 Đăng ký môn học", payload: "Quy định đăng ký môn học" },
    { title: "🎓 Chuẩn đầu ra NN", payload: "Chuẩn đầu ra tiếng Anh" },
    { title: "🏛️ Danh bạ phòng ban", payload: "Danh bạ các phòng ban" },
];

/**
 * Xử lý câu hỏi của sinh viên theo kịch bản mẫu Sổ tay Sinh viên OU
 */
export async function handleStudentQuestion(question: string, studentId?: string): Promise<StudentAnswerResult> {
    const rawText = (question || "").trim();
    if (!rawText) {
        return {
            success: false,
            answer: "Chào bạn! Tôi là Trợ lý Sổ tay Sinh viên OU. Bạn cần tra cứu thông tin gì về quy chế học vụ, đăng ký môn, chuẩn đầu ra, học bổng hay điểm rèn luyện?",
            quickReplies: DEFAULT_QUICK_REPLIES,
        };
    }

    // 1. Chào hỏi / xem menu chủ đề
    const isGreeting = /^(xin chào|chào|hello|hi|chào bot|cho hỏi|alo|menu|bắt đầu|start|chủ đề)$/i.test(rawText);
    if (isGreeting) {
        const studentGreeting = studentId ? ` (MSSV: ${studentId})` : "";
        return {
            success: true,
            answer:
                `👋 Xin chào sinh viên${studentGreeting}!\n` +
                `Tôi là Trợ lý Ảo Sổ tay Sinh viên Trường Đại học Mở TP.HCM (OU).\n\n` +
                `Bạn có thể hỏi tôi bất kỳ thông tin nào theo Sổ tay Sinh viên:\n` +
                `• Cơ sở học tập, khung giờ học, hệ thống SIS/LMS & Email @ou.edu.vn\n` +
                `• Thang điểm A+/A (hệ 4), xếp loại, cảnh báo học tập, bảo lưu, miễn giảm môn\n` +
                `• Đăng ký môn học (8-23 TC), rút môn, điều chỉnh lịch thi\n` +
                `• Chuẩn đầu ra Ngoại ngữ (bậc 3/6 - 4/6), Tin học, GDQP&AN & Tốt nghiệp\n` +
                `• Học bổng, miễn giảm học phí, điểm rèn luyện, đăng ký ngoại trú & kỷ luật\n` +
                `• Danh bạ các Phòng ban, 12 Khoa đào tạo & Hotline An ninh`,
            quickReplies: DEFAULT_QUICK_REPLIES,
        };
    }

    // 1.5. Nếu người dùng chọn đúng một chủ đề trong HANDBOOK_TOPICS
    const normInput = removeVietnameseDiacritics(rawText);
    const matchedTopic = HANDBOOK_TOPICS.find(
        (t) =>
            removeVietnameseDiacritics(t.name) === normInput ||
            t.code.toLowerCase() === rawText.toLowerCase()
    );
    if (matchedTopic) {
        const topicArticles = HANDBOOK_ARTICLES.filter((a) => a.topic === matchedTopic.code);
        const listText = topicArticles.map((a, idx) => `${idx + 1}. ${a.title}\n   → ${a.summary}`).join("\n\n");
        return {
            success: true,
            topic: matchedTopic.code,
            answer: `📂 [${matchedTopic.name}]\n\n${listText}\n\n👉 Bạn hãy nhắn tên mục hoặc câu hỏi cụ thể để xem chi tiết nhé!`,
            quickReplies: topicArticles.slice(0, 4).map((a) => ({
                title: a.title.length > 22 ? a.title.substring(0, 20) + "..." : a.title,
                payload: a.title,
            })),
        };
    }

    // 2. Tìm kiếm trong CSDL Sổ tay Sinh viên
    const matched = searchHandbookArticles(rawText);

    if (matched.length > 0) {
        const topArticle = matched[0];
        let answerText = `📖 [SỔ TAY SINH VIÊN OU] ${topArticle.title.toUpperCase()}\n\n`;
        answerText += `${topArticle.content}\n\n`;
        answerText += `💡 Nếu cần hỗ trợ trường hợp cá nhân, bạn liên hệ Phòng Quản lý đào tạo (quanlydaotao@ou.edu.vn) hoặc Phòng CTSV&TT (osa@ou.edu.vn | (028) 39330660).`;

        const otherSuggestions = matched.slice(1, 3).map((a) => ({
            title: a.title.length > 22 ? a.title.substring(0, 20) + "..." : a.title,
            payload: a.title,
        }));

        if (otherSuggestions.length === 0) {
            otherSuggestions.push(
                { title: "🏛️ Danh bạ phòng ban", payload: "Danh bạ các phòng ban" },
                { title: "📚 Quy chế học vụ", payload: "Thang điểm và xếp loại học lực" }
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

    // 3. Fallback AI (Gemini / Groq) nếu câu hỏi diễn đạt tự do chưa khớp từ khóa
    try {
        const contextChunks = HANDBOOK_ARTICLES.slice(0, 8).map((a) => `${a.title}:\n${a.summary}\n${a.content}`);
        const llmReply = await generateLlmAnswer(rawText, [], contextChunks, undefined, OU_SYSTEM_PROMPT);
        if (llmReply) {
            return {
                success: true,
                answer: `🎓 [Tư vấn Sinh viên OU]\n\n${llmReply}\n\n📌 Thông tin tham khảo từ Sổ tay Sinh viên ĐH Mở TP.HCM.`,
                quickReplies: DEFAULT_QUICK_REPLIES,
            };
        }
    } catch (e: any) {
        console.warn("[ouService] LLM fallback error:", e.message);
    }

    // 4. Mặc định nếu không tìm thấy
    return {
        success: false,
        answer: `Hiện tại Trợ lý Sổ tay Sinh viên chưa tìm thấy thông tin chính xác cho câu hỏi: "${rawText}".\n\nBạn có thể thử chọn các chủ đề phổ biến bên dưới hoặc liên hệ Phòng Công tác Sinh viên & Truyền thông (osa@ou.edu.vn | Hotline: (028) 39330660) để được hỗ trợ trực tiếp.`,
        quickReplies: DEFAULT_QUICK_REPLIES,
    };
}
