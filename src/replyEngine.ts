import { generateRagReply } from "./rag/ragEngine";
import { classifyTopicAndReply } from "./topicEngine";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";
import { addMessageToSession, updateSessionContext, getSession } from "./memory/sessionMemory";
import { extractIntentAndEntities, IntentResult, QuickReplyButton } from "./intentEngine";
import { GENERAL_SLOT_FILLING_REPLY, createTicket, formatUserTicketMessage, Ticket } from "./ticket/ticketService";

interface SpecialRule {
    match: (text: string, normText: string) => boolean;
    reply: string;
}

export interface BotReplyResult {
    replyText: string;
    recommendedButtons: QuickReplyButton[];
    extractedIntent: IntentResult;
    createdTicket?: Ticket;
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

/**
 * Trích xuất số phòng nếu xuất hiện trong câu nói của người dùng.
 */
function extractAndSaveRoomNumber(userId: string, userText: string, normText: string): void {
    const roomMatch = userText.match(/(?:phòng|phong|p\.?)\s*(\d{3,4})/i) || normText.match(/(?:phong|p\.?)\s*(\d{3,4})/i);
    if (roomMatch && roomMatch[1]) {
        updateSessionContext(userId, { roomNumber: roomMatch[1] });
        console.log(`[replyEngine] Tự động cập nhật số phòng ${roomMatch[1]} cho user ${userId}`);
    } else if (/^\d{3,4}$/.test(userText.trim())) {
        updateSessionContext(userId, { roomNumber: userText.trim() });
        console.log(`[replyEngine] Tự động cập nhật số phòng ${userText.trim()} cho user ${userId}`);
    }
}

export async function generateReply(userText: string, userId: string = "default_user"): Promise<string> {
    const res = await generateReplyWithButtons(userText, userId);
    return res.replyText;
}

export async function generateReplyWithButtons(userText: string, userId: string = "default_user"): Promise<BotReplyResult> {
    const cleanText = splitUnspacedWords(normalizeTelexTypos(userText));
    const normText = removeVietnameseDiacritics(cleanText);

    // 0. Lưu tin nhắn của người dùng vào session memory & trích xuất số phòng
    addMessageToSession(userId, "user", userText);
    extractAndSaveRoomNumber(userId, userText, normText);

    const session = getSession(userId);
    const intentResult = extractIntentAndEntities(userText, session.roomNumber);

    let reply = "";
    let createdTicket: Ticket | undefined;

    // 1. Kiểm tra các quy tắc đặc biệt (ví dụ: số phòng)
    for (const rule of SPECIAL_RULES) {
        if (rule.match(userText, normText) || rule.match(cleanText, normText)) {
            reply = rule.reply;
            break;
        }
    }

    // 2. BƯỚC 1 & BƯỚC 2: XỬ LÝ BÁO SỰ CỐ & TẠO TICKET
    if (!reply && (intentResult.intent === "REPORT_ISSUE" || intentResult.intent === "EMERGENCY")) {
        if (!intentResult.deviceType) {
            // BƯỚC 1: SLOT FILLING - Người dùng chỉ nói chung chung (vd: "báo cáo sự cố", "phòng hỏng đồ")
            // TUYỆT ĐỐI KHÔNG TẠO TICKET. Hỏi lại để làm rõ thiết bị.
            reply = GENERAL_SLOT_FILLING_REPLY;
        } else {
            // BƯỚC 2: TẠO PHIẾU XÁC NHẬN - Người dùng đã cung cấp thiết bị cụ thể (vd: "hỏng điều hòa", "cháy bóng đèn")
            createdTicket = createTicket(userId, session.roomNumber, userText, intentResult.deviceType);
            reply = formatUserTicketMessage(createdTicket);
        }
    }

    // 3. Phân loại theo Topic & Sub-branches
    if (!reply) {
        const topicResult = classifyTopicAndReply(userText);
        if (topicResult.matched) {
            reply = topicResult.answer;
        }
    }

    // 4. Fallback sang RAG / Microservices / LLM Synthesis nếu chưa có câu trả lời
    if (!reply) {
        reply = await generateRagReply(userText, userId);
    }

    // 5. Lưu phản hồi của assistant vào session memory
    addMessageToSession(userId, "assistant", reply);

    return {
        replyText: reply,
        recommendedButtons: intentResult.recommendedButtons,
        extractedIntent: intentResult,
        createdTicket,
    };
}