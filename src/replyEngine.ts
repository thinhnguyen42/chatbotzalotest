import { generateRagReply } from "./rag/ragEngine";
import { classifyTopicAndReply } from "./topicEngine";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";
import { addMessageToSession, updateSessionContext, getSession } from "./memory/sessionMemory";
import { extractIntentAndEntities, IntentResult, QuickReplyButton } from "./intentEngine";
import { INCIDENT_FORM_TEMPLATE_REPLY, createTicket, formatUserTicketMessage, formatAdminTicketMessage, Ticket } from "./ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "./config/adminConfig";
import { notifyAdmin } from "./zaloClient";
import { resolveUserRole, handlePhoneClaim } from "./user/userRoleService";
import { handleAdminRemoveTag } from "./user/adminTagService";

interface SpecialRule {
    match: (text: string, normText: string) => boolean;
    reply: string;
}

export interface BotReplyResult {
    replyText: string;
    recommendedButtons: QuickReplyButton[];
    extractedIntent: IntentResult;
    createdTicket?: Ticket;
    adminNotificationMsg?: string;
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
    if (intentResult.phone) {
        updateSessionContext(userId, { phone: intentResult.phone });
    }

    // 0.1 Phân giải vai trò người dùng (ADMIN, PRIMARY_LEASEHOLDER, CO_RESIDENT, UNTAGGED_GUEST)
    const userRoleCtx = await resolveUserRole(userId);

    // 0.1.1 Lệnh quản trị viên: Gỡ Tag phòng (ví dụ: "Toi muon go tag phong 101 nay")
    if (userRoleCtx.role === "ADMIN") {
        const adminRemoveRes = await handleAdminRemoveTag(userText, userId);
        if (adminRemoveRes.handled && adminRemoveRes.replyText) {
            addMessageToSession(userId, "assistant", adminRemoveRes.replyText);
            return {
                replyText: adminRemoveRes.replyText,
                recommendedButtons: [
                    { title: "🏠 Xem phòng trống", payload: "phòng trống" },
                ],
                extractedIntent: intentResult,
            };
        }
    }

    if (userRoleCtx.role === "PRIMARY_LEASEHOLDER" || userRoleCtx.role === "CO_RESIDENT") {
        if (userRoleCtx.roomNumber && (!session.roomNumber || session.roomNumber === "Chưa xác định")) {
            updateSessionContext(userId, {
                roomNumber: userRoleCtx.roomNumber,
                userName: userRoleCtx.tenantName,
                role: userRoleCtx.role,
                tagCode: userRoleCtx.tagCode,
                address: userRoleCtx.address,
            });
        }
    } else if (userRoleCtx.role === "UNTAGGED_GUEST") {
        // Xử lý luồng claim SĐT người thuê — Zero Information Disclosure (Task 2)
        const claimResult = await handlePhoneClaim(userText, userId, session.userName);
        if (claimResult.handled && claimResult.replyText) {
            addMessageToSession(userId, "assistant", claimResult.replyText);
            return {
                replyText: claimResult.replyText,
                recommendedButtons: [
                    { title: "📞 Hotline Ban Quản Lý", payload: "Liên hệ" },
                    { title: "🏠 Xem phòng trống", payload: "phòng trống" },
                ],
                extractedIntent: intentResult,
            };
        }
    }

    // Pre-filter: Direct Admin Forwarding for exact "admin", "lien he", "liên hệ" messages
    if (/^(admin|lien\s*he|liên\s*hệ)$/i.test(userText.trim())) {
        const phone = (session as any).phone || intentResult.phone || "Chưa cung cấp";
        const roomNumber = session.roomNumber || "Chưa xác định";
        const timeStr = new Date().toLocaleString("vi-VN");
        const adminMsg = `📩 [YÊU CẦU CHUYỂN GIAO BAN QUẢN LÝ / ADMIN]\n👤 ID Zalo: ${userId}\n📞 Số điện thoại: ${phone}\n🏠 Số phòng: ${roomNumber}\n⏰ Thời gian: ${timeStr}`;

        console.log(`[replyEngine] Direct admin forward for user ${userId}:`, adminMsg);

        const directAdminReply = `Dạ, Quản gia AI đã chuyển thông báo yêu cầu hỗ trợ của bạn đến Ban Quản lý / Admin tòa nhà rồi ạ!\n\n📞 Trong trường hợp cần xử lý gấp, bạn có thể gọi trực tiếp Hotline Admin: ${ADMIN_PHONE_NUMBER}.\nBan quản lý sẽ kiểm tra tin nhắn và liên hệ hỗ trợ bạn trong thời gian sớm nhất ạ!`;

        addMessageToSession(userId, "assistant", directAdminReply);

        return {
            replyText: directAdminReply,
            recommendedButtons: intentResult.recommendedButtons,
            extractedIntent: intentResult,
            createdTicket: undefined,
            adminNotificationMsg: adminMsg,
        };
    }

    let reply = "";
    let createdTicket: Ticket | undefined;
    let adminNotificationMsg: string | undefined;

    // 1. Kiểm tra các quy tắc đặc biệt (ví dụ: số phòng)
    for (const rule of SPECIAL_RULES) {
        if (rule.match(userText, normText) || rule.match(cleanText, normText)) {
            reply = rule.reply;
            break;
        }
    }

    // 2. XỬ LÝ YÊU CẦU GẶP ADMIN / BAN QUẢN LÝ (ADMIN_REQUEST)
    if (!reply && intentResult.intent === "ADMIN_REQUEST") {
        createdTicket = createTicket(
            userId,
            session.roomNumber,
            userText,
            "Yêu cầu gặp Admin / Ban quản lý",
            intentResult.preferredTime,
            intentResult.phone
        );
        reply = `Dạ, Quản gia AI đã chuyển thông báo yêu cầu hỗ trợ của bạn đến Ban Quản lý / Admin tòa nhà rồi ạ!\n\n📞 Trong trường hợp cần xử lý gấp, bạn có thể gọi trực tiếp Hotline Admin: ${ADMIN_PHONE_NUMBER}.\nBan quản lý sẽ kiểm tra tin nhắn và liên hệ hỗ trợ bạn trong thời gian sớm nhất ạ!`;
        adminNotificationMsg = formatAdminTicketMessage(createdTicket);
    }

    // 3. BƯỚC 1 & BƯỚC 2: XỬ LÝ BÁO SỰ CỐ & TẠO TICKET
    if (!reply && (intentResult.intent === "REPORT_ISSUE" || intentResult.intent === "EMERGENCY")) {
        const hasValidRoom = session.roomNumber && session.roomNumber !== "Chưa xác định" && session.roomNumber !== "000";
        if (!intentResult.deviceType || !hasValidRoom) {
            // Chưa đủ thông tin thiết bị HOẶC chưa có số phòng -> Trả về Mẫu thông tin báo sự cố để người dùng nhập đầy đủ.
            // TUYỆT ĐỐI KHÔNG TẠO TICKET KHI CHƯA RÕ SỐ PHÒNG HOẶC THIẾT BỊ.
            reply = INCIDENT_FORM_TEMPLATE_REPLY;
        } else {
            // Đã đủ thiết bị VÀ số phòng -> Tạo phiếu xác nhận & gửi báo cáo cho Admin
            const phoneToUse = intentResult.phone || (session as any).phone;
            createdTicket = createTicket(
                userId,
                session.roomNumber,
                userText,
                intentResult.deviceType,
                intentResult.preferredTime,
                phoneToUse
            );
            reply = formatUserTicketMessage(createdTicket);
            adminNotificationMsg = formatAdminTicketMessage(createdTicket);
        }
    }

    // 4. Phân loại theo Topic & Sub-branches
    if (!reply) {
        const topicResult = classifyTopicAndReply(userText);
        if (topicResult.matched) {
            reply = topicResult.answer;
        }
    }

    // 5. Fallback sang RAG / Microservices / LLM Synthesis nếu chưa có câu trả lời
    if (!reply) {
        reply = await generateRagReply(userText, userId);
    }

    // 6. Lưu phản hồi của assistant vào session memory
    addMessageToSession(userId, "assistant", reply);

    return {
        replyText: reply,
        recommendedButtons: intentResult.recommendedButtons,
        extractedIntent: intentResult,
        createdTicket,
        adminNotificationMsg,
    };
}