import { generateRagReply } from "./rag/ragEngine";
import { classifyTopicAndReply } from "./topicEngine";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";
import { addMessageToSession, updateSessionContext, getSession } from "./memory/sessionMemory";
import { extractIntentAndEntities, IntentResult, QuickReplyButton } from "./intentEngine";
import { createTicket, formatAdminTicketMessage, Ticket } from "./ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "./config/adminConfig";
import { notifyAdmin } from "./zaloClient";
import { resolveUserRole, handlePhoneClaim, handleCccdClaim } from "./user/userRoleService";
import { handleCsvTenantClaim } from "./user/tenantCsvService";
import { handleAdminRemoveTag } from "./user/adminTagService";
import { LARK_INCIDENT_FORM_URL, LARK_INCIDENT_SHORT_URL } from "./lark/larkClient";
import { requestPasscode } from "./ttlock/ttlockClient";
import { getActivePasscode, saveActivePasscode } from "./ttlock/lockRegistry";

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
 * Làm sạch cú pháp Markdown (như **, *, __) và chuẩn hóa khoảng cách xuống dòng
 * giúp văn bản hiển thị đẹp mắt, tự nhiên trên Zalo (vốn không hỗ trợ Markdown).
 */
export function cleanZaloMarkdown(text: string): string {
    if (!text) return text;
    return text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/_{2,}(.*?)_{2,}/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

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

    // Xử lý phím tắt số 1, 2, 3, 4 hoặc lựa chọn khi đang trong luồng chọn cửa/chiều:
    if (session.pendingGateAction) {
        const trimmed = userText.trim();
        const normTrimmed = normText.trim();

        if (session.pendingGateAction.step === "CHOOSE_DOOR") {
            if (/^(\[?1\]?|một|mot|chon 1|chọn 1|cua to|cong to|cong lon|cổng lớn|cổng to|cửa to)$/i.test(normTrimmed) || /^(\[?1\]?|cửa to|cổng lớn)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = "CUA_TO";
                intentResult.direction = "UNSPECIFIED";
            } else if (/^(\[?2\]?|hai|chon 2|chọn 2|cua nho|cong nho|cổng nhỏ|cửa nhỏ|shipper)$/i.test(normTrimmed) || /^(\[?2\]?|cửa nhỏ|cổng nhỏ)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = "CUA_NHO";
                intentResult.direction = "UNSPECIFIED";
            } else if (/^(\[?3\]?|ba|chon 3|chọn 3|gara|ham xe|cửa gara|hầm xe|ham gara)$/i.test(normTrimmed) || /^(\[?3\]?|gara|cửa gara)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = "GARA";
                intentResult.direction = "UNSPECIFIED";
            } else if (/^(\[?4\]?|bon|bốn|tu|tư|chon 4|chọn 4|phong|cua phong|cửa phòng|phòng)$/i.test(normTrimmed) || /^(\[?4\]?|cửa phòng|phòng)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = "ROOM";
                intentResult.direction = "IN";
            }
        } else if (session.pendingGateAction.step === "CHOOSE_DIRECTION") {
            const currentDoor = session.pendingGateAction.doorType || "CUA_TO";
            if (/^(\[?1\]?|một|mot|chon 1|chọn 1|vao|chieu vao|chiều vào|vào|in)$/i.test(normTrimmed) || /^(\[?1\]?|chiều vào|vào)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = currentDoor;
                intentResult.direction = "IN";
            } else if (/^(\[?2\]?|hai|chon 2|chọn 2|ra|chieu ra|chiều ra|ra|out)$/i.test(normTrimmed) || /^(\[?2\]?|chiều ra|ra)$/i.test(trimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = currentDoor;
                intentResult.direction = "OUT";
            } else if (/^(\[?3\]?|ba|chon 3|chọn 3|quay lai|doi cua|chon lai|cua khac|cửa khác)$/i.test(normTrimmed)) {
                intentResult.intent = "GATE_ACCESS";
                intentResult.doorType = "UNSPECIFIED";
                intentResult.direction = "UNSPECIFIED";
                session.pendingGateAction = { step: "CHOOSE_DOOR" };
            }
        }
    }

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
                recommendedButtons: [],
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
        // 1. Ưu tiên xác thực cư dân trực tiếp qua file CSV (Họ tên + CCCD) - Hoạt động độc lập không cần Lark Base
        const csvClaimResult = await handleCsvTenantClaim(userText, userId);
        if (csvClaimResult.handled && csvClaimResult.replyText) {
            addMessageToSession(userId, "assistant", csvClaimResult.replyText);
            return {
                replyText: csvClaimResult.replyText,
                recommendedButtons: csvClaimResult.customButtons || [],
                extractedIntent: intentResult,
            };
        }

        // 2. Fallback sang luồng Lark Base (nếu còn dùng)
        // Xử lý luồng xác thực CCCD cư dân — Zero Information Disclosure
        const claimResult = await handleCccdClaim(userText, userId, session.userName);
        if (claimResult.handled && claimResult.replyText) {
            addMessageToSession(userId, "assistant", claimResult.replyText);
            return {
                replyText: claimResult.replyText,
                recommendedButtons: [],
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
            recommendedButtons: [],
            extractedIntent: intentResult,
            createdTicket: undefined,
            adminNotificationMsg: adminMsg,
        };
    }

    let reply = "";
    let createdTicket: Ticket | undefined;
    let adminNotificationMsg: string | undefined;
    let customButtons: QuickReplyButton[] | undefined;

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

    // 2.5. XỬ LÝ YÊU CẦU MỞ CỔNG / MỞ PHÒNG / GARA / SHIPPER (GATE_ACCESS)
    if (!reply && intentResult.intent === "GATE_ACCESS") {
        if (userRoleCtx.role !== "PRIMARY_LEASEHOLDER" && userRoleCtx.role !== "CO_RESIDENT" && userRoleCtx.role !== "ADMIN") {
            reply = `Dạ, tính năng cấp mã mở cửa / passcode tự động chỉ dành cho cư dân đã đăng ký tại tòa nhà ạ.\n\nBạn vui lòng gửi Họ tên kèm số CCCD (Ví dụ: "Phạm Kiều Oanh 092301002987") để Quản gia AI kích hoạt quyền cư dân và cấp mã ngay nhé!\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`;
            customButtons = [
                { title: "🆔 Xác thực cư dân", payload: "Xác thực cư dân" },
                { title: "📞 Hotline Ban Quản lý", payload: "Liên hệ" },
            ];
        } else {
            const tagCode = (userRoleCtx.role === "ADMIN" && intentResult.roomNumber) ? `38PBV-${intentResult.roomNumber}` : (userRoleCtx.tagCode || (session as any).tagCode || "38PBV-102");
            const roomNum = (userRoleCtx.role === "ADMIN" && intentResult.roomNumber) ? intentResult.roomNumber : (userRoleCtx.roomNumber || session.roomNumber || "102");
            const tenantName = userRoleCtx.tenantName ? ` ${userRoleCtx.tenantName}` : "";
            const doorType = intentResult.doorType || "UNSPECIFIED";
            const direction = intentResult.direction || "UNSPECIFIED";
            const isRoomDoor = doorType === "ROOM";

            // BƯỚC 1: Người dùng yêu cầu pass chung chung -> Hiện 4 nút chọn cửa
            if (doorType === "UNSPECIFIED") {
                session.pendingGateAction = { step: "CHOOSE_DOOR" };
                reply = `Dạ chào bạn${tenantName}! Quản gia AI có thể tạo mã PIN mở cửa tự động cho bạn ngay.\n\nBạn muốn lấy passcode cho khu vực nào ạ? Vui lòng bấm chọn bên dưới nhé:\n\n⏱ Mã sau khi tạo sẽ có hiệu lực trong vòng 30 phút.`;
                customButtons = [
                    { title: "🚪 Cửa to", payload: "Cửa to" },
                    { title: "🚶 Cửa nhỏ", payload: "Cửa nhỏ" },
                    { title: "🚗 Cửa gara", payload: "Cửa gara" },
                    { title: "🏠 Cửa phòng", payload: "Cửa phòng" },
                ];
            }
            // BƯỚC 2: Đối với Cửa to / Cửa nhỏ / Gara -> Nếu CHƯA chọn chiều -> Hỏi chiều Ra/Vào
            // (Cửa phòng là khóa phòng riêng, không phân biệt chiều -> bỏ qua bước này để cấp mã ngay)
            else if (!isRoomDoor && direction === "UNSPECIFIED") {
                session.pendingGateAction = { step: "CHOOSE_DIRECTION", doorType };
                if (doorType === "CUA_TO") {
                    reply = `🚪 Bạn muốn lấy mã PIN Cửa to (Cổng lớn) cho chiều nào ạ?\n\nVui lòng bấm chọn một trong các nút bên dưới:`;
                    customButtons = [
                        { title: "🟢 Chiều vào", payload: "Cửa to chiều vào" },
                        { title: "🔴 Chiều ra", payload: "Cửa to chiều ra" },
                        { title: "🔙 Chọn cửa khác", payload: "Chọn cửa khác" },
                    ];
                } else if (doorType === "CUA_NHO") {
                    reply = `🚶 Bạn muốn lấy mã PIN Cửa nhỏ (Cổng nhỏ / Shipper) cho chiều nào ạ?\n\nVui lòng bấm chọn một trong các nút bên dưới:`;
                    customButtons = [
                        { title: "🟢 Chiều vào", payload: "Cửa nhỏ chiều vào" },
                        { title: "🔴 Chiều ra", payload: "Cửa nhỏ chiều ra" },
                        { title: "🔙 Chọn cửa khác", payload: "Chọn cửa khác" },
                    ];
                } else if (doorType === "GARA") {
                    reply = `🚗 Bạn muốn lấy mã PIN Cửa Gara (Hầm xe) cho chiều nào ạ?\n\nVui lòng bấm chọn một trong các nút bên dưới:`;
                    customButtons = [
                        { title: "🟢 Chiều vào", payload: "Cửa gara chiều vào" },
                        { title: "🔴 Chiều ra", payload: "Cửa gara chiều ra" },
                        { title: "🔙 Chọn cửa khác", payload: "Chọn cửa khác" },
                    ];
                }
            }
            // BƯỚC 3: Cửa phòng HOẶC đã chọn chiều -> Sinh mã PIN và CUNG CẤP NÚT CHỌN CỬA KHÁC
            else {
                session.pendingGateAction = undefined;

                let targetLockCode = "";
                let doorLabel = "";

                if (doorType === "CUA_TO") {
                    targetLockCode = direction === "OUT" ? "CONG_LON_OUT" : "CONG_LON_IN";
                    doorLabel = `Cửa to (${direction === "OUT" ? "Chiều ra" : "Chiều vào"})`;
                } else if (doorType === "CUA_NHO") {
                    targetLockCode = direction === "OUT" ? "CONG_NHO_OUT" : "CONG_NHO_IN";
                    doorLabel = `Cửa nhỏ (${direction === "OUT" ? "Chiều ra" : "Chiều vào"})`;
                } else if (doorType === "GARA") {
                    targetLockCode = direction === "OUT" ? "GARA_OUT" : "GARA_IN";
                    doorLabel = `Cửa Gara (${direction === "OUT" ? "Chiều ra" : "Chiều vào"})`;
                } else {
                    targetLockCode = tagCode || "38PBV-601";
                    doorLabel = `Cửa phòng riêng (Phòng ${roomNum})`;
                }

                // 1. Kiểm tra mã PIN còn hiệu lực trong bộ nhớ đệm (còn > 2 phút)
                const activePass = getActivePasscode(userId, targetLockCode);
                let result: any;
                let isReused = false;

                if (activePass) {
                    const remainingMins = Math.max(1, Math.round((activePass.expiresAt - Date.now()) / (60 * 1000)));
                    result = {
                        success: true,
                        passcode: activePass.passcode,
                        validMinutes: remainingMins,
                    };
                    isReused = true;
                } else {
                    // 2. Nếu chưa có mã hoặc đã hết hạn -> Gọi tạo mã mới
                    const isAdmin = userRoleCtx.role === "ADMIN";
                    result = await requestPasscode(targetLockCode, userId, isAdmin);
                    if (result.success && result.passcode) {
                        saveActivePasscode(userId, targetLockCode, {
                            passcode: result.passcode,
                            expiresAt: result.expiresAt || (Date.now() + (result.validMinutes || 30) * 60 * 1000),
                            validMinutes: result.validMinutes || 30,
                            tagCode: targetLockCode,
                            doorLabel,
                        });
                    }
                }

                if (result.success && result.passcode) {
                    const expireStr = `${result.validMinutes ?? 30} phút`;
                    if (isReused) {
                        reply = `🔑 Quản gia AI gửi lại mã mở ${doorLabel} đang hoạt động của bạn:\n\nMã PIN: ${result.passcode}\nThời hạn còn lại: khoảng ${expireStr}\n\n📌 Hướng dẫn mở cửa:\n• Nhập mã PIN trên bàn phím khóa để mở cửa.\n• Sau khi qua cửa, bạn vui lòng khép cửa cẩn thận nhé!\n\n⚠️ Vui lòng không chia sẻ mã này cho người lạ ngoài người thân.`;
                    } else {
                        reply = `🔑 Quản gia AI đã tạo mã mở ${doorLabel} cho bạn:\n\nMã PIN: ${result.passcode}\nHiệu lực: ${expireStr} (tự hủy sau khi hết hạn)\n\n📌 Hướng dẫn mở cửa:\n• Nhập mã PIN trên bàn phím khóa để mở cửa.\n• Sau khi qua cửa, bạn vui lòng khép cửa cẩn thận nhé!\n\n⚠️ Vui lòng không chia sẻ mã này cho người lạ ngoài người thân.`;
                        adminNotificationMsg = `🚪 [PASSCODE ĐÃ CẤP]\n• Cửa: ${doorLabel} (${targetLockCode})\n• Phòng: ${roomNum} (${tagCode})\n• Cư dân: ${userRoleCtx.tenantName || "Cư dân"}\n• Mã PIN: ${result.passcode}\n• Hiệu lực: ${expireStr}\n• Thời gian cấp: ${new Date().toLocaleString("vi-VN")}`;
                    }

                    // ĐÍNH KÈM NÚT "CHỌN CỬA KHÁC" để cư dân thuận tiện mở tiếp các cửa khác nếu cần
                    customButtons = [
                        { title: "🚪 Chọn cửa khác", payload: "Chọn cửa khác" },
                        { title: "📞 Hotline Ban Quản lý", payload: "Liên hệ" },
                    ];
                } else if (result.error?.startsWith("rate_limited:")) {
                    const timeLeft = result.error.split(":")[1] || "vài giờ";
                    reply = `Dạ, bạn đã đạt giới hạn yêu cầu tạo mã mở cửa hôm nay.\nVui lòng thử lại sau ${timeLeft} hoặc liên hệ trực tiếp Ban Quản lý để được hỗ trợ mở cửa ngay nhé:\n📞 Hotline: ${ADMIN_PHONE_NUMBER}`;
                    customButtons = [
                        { title: "📞 Gọi Ban Quản lý", payload: "Liên hệ" },
                    ];
                } else if (result.error === "lock_not_found") {
                    reply = `Dạ, hệ thống chưa tìm thấy cấu hình khóa điện cho ${doorLabel}.\nBạn vui lòng liên hệ Ban Quản lý để được hỗ trợ: 📞 ${ADMIN_PHONE_NUMBER}`;
                    customButtons = [
                        { title: "🚪 Chọn cửa khác", payload: "Chọn cửa khác" },
                        { title: "📞 Gọi Ban Quản lý", payload: "Liên hệ" },
                    ];
                } else {
                    reply = `Dạ, hệ thống khóa điện thông minh đang tạm thời bận.\nBạn vui lòng thử lại sau ít phút hoặc gọi Hotline Ban Quản lý: 📞 ${ADMIN_PHONE_NUMBER}`;
                    customButtons = [
                        { title: "🔄 Thử lại", payload: userText },
                        { title: "📞 Gọi Ban Quản lý", payload: "Liên hệ" },
                    ];
                }
            }
        }
    }

    // 3. BƯỚC 1 & BƯỚC 2: XỬ LÝ BÁO SỰ CỐ — Gửi link Form Lark Base
    if (!reply && (intentResult.intent === "REPORT_ISSUE" || intentResult.intent === "EMERGENCY")) {
        const roomNumber = session.roomNumber && session.roomNumber !== "Chưa xác định" && session.roomNumber !== "000"
            ? session.roomNumber
            : (intentResult.roomNumber || "");
        const toaNha = (session as any).tagCode
            ? String((session as any).tagCode).split("-")[0]   // "38PBV-401" → "38PBV"
            : "38PBV";
        const address = (session as any).address || "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh";

        // Tạo link form với thông tin đã điền sẵn (pre-fill qua query params Lark Base)
        const formParams = new URLSearchParams();
        if (roomNumber) formParams.set("prefill_SoPhong", roomNumber);
        if (toaNha) formParams.set("prefill_ToaNha", toaNha);
        formParams.set("prefill_ZaloUserID", userId);

        const formUrl = `${LARK_INCIDENT_FORM_URL}?${formParams.toString()}`;

        // Dùng URL rút gọn chuyên nghiệp hoặc short URL qua server nếu domain hợp lệ
        const hasValidServerBase = process.env.SERVER_BASE_URL &&
            !process.env.SERVER_BASE_URL.includes("your-domain.com") &&
            !process.env.SERVER_BASE_URL.includes("localhost");

        const displayUrl = hasValidServerBase
            ? `${process.env.SERVER_BASE_URL}/sc?uid=${encodeURIComponent(userId)}`
            : (process.env.LARK_INCIDENT_SHORT_URL || LARK_INCIDENT_FORM_URL);

        const roomInfo = roomNumber ? ` phòng ${roomNumber}` : "";
        reply = intentResult.intent === "EMERGENCY"
            ? `🚨 Quản gia AI đã nhận được thông báo khẩn cấp${roomInfo}!\n\nBạn vui lòng gửi thông tin sự cố qua form bên dưới để đội kỹ thuật có mặt hỗ trợ ngay:\n\n📋 FORM BÁO HỎNG & SỰ CỐ:\n👉 ${displayUrl}\n\n⚠️ Nếu cần hỗ trợ ngay lập tức, gọi Hotline: ${ADMIN_PHONE_NUMBER}`
            : `Dạ, Quản gia AI đã nhận được yêu cầu báo sự cố / sửa chữa${roomInfo}!\n\nBạn vui lòng mở liên kết bên dưới để gửi thông tin hư hỏng, đội kỹ thuật sẽ chuẩn bị dụng cụ và hỗ trợ bạn sớm nhất nhé:\n\n📋 FORM YÊU CẦU SỬA CHỮA:\n👉 ${displayUrl}\n\n💡 Bạn có thể đính kèm ảnh/video mô tả hư hỏng trong form ạ.\n📞 Hotline hỗ trợ: ${ADMIN_PHONE_NUMBER}`;

        // Gửi thông báo tạm cho Admin biết có khách đang báo sự cố (trước khi khách điền form)
        adminNotificationMsg = `📥 [KHÁCH ĐANG BÁO SỰ CỐ]\n👤 Zalo ID: ${userId}\n🏠 Phòng: ${roomNumber || "Chưa rõ"} - ${toaNha}\n💬 Tin nhắn: "${userText}"\n⏰ Thời gian: ${new Date().toLocaleString("vi-VN")}\n\n👉 Khách đã được gửi link form Lark Base để điền thông tin chi tiết.`;
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

    // 6. Làm sạch ký tự Markdown (*, **, _) và chuẩn hóa xuống hàng trước khi gửi cho người dùng
    reply = cleanZaloMarkdown(reply);

    // 7. Lưu phản hồi của assistant vào session memory
    addMessageToSession(userId, "assistant", reply);

    return {
        replyText: reply,
        recommendedButtons: customButtons || [],
        extractedIntent: intentResult,
        createdTicket,
        adminNotificationMsg,
    };
}