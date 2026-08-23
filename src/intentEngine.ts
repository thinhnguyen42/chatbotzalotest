import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";

export type IntentType = "EMERGENCY" | "REPORT_ISSUE" | "NOISE_COMPLAINT" | "BILLING" | "ADMIN_REQUEST" | "GENERAL_FAQ";

export interface QuickReplyButton {
    title: string;
    payload: string;
}

export interface IntentResult {
    intent: IntentType;
    roomNumber?: string;
    deviceType?: string;
    urgencyLevel: "HIGH" | "MEDIUM" | "LOW";
    summary: string;
    recommendedButtons: QuickReplyButton[];
}

const DEFAULT_BUTTONS: QuickReplyButton[] = [
    { title: "📍 Địa chỉ", payload: "Địa chỉ" },
    { title: "💰 Chi phí", payload: "Chi phí" },
    { title: "📜 Nội quy", payload: "Nội quy nhà" },
    { title: "🔧 Báo sự cố", payload: "Báo sự cố" },
    { title: "📞 Hotline", payload: "Liên hệ" },
];

// Danh sách các thiết bị cụ thể.
const DEVICE_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    { type: "bóng đèn / điện", regex: /\b(den|bong den|cong tac|o dien|mat dien|chap dien|chay den|den sang|den hong)\b/i },
    { type: "máy lạnh / điều hòa", regex: /\b(dieu hoa|may lanh)\b/i },
    { type: "vòi nước / bồn cầu", regex: /\b(voi nuoc|voi hoa sen|voi rua|ro ri|chay nuoc|mat nuoc|bon cau|tac cong|duong nuoc)\b/i },
    { type: "khóa cửa / thẻ từ", regex: /\b(khoa cua|o khoa|the tu|van tay)\b/i },
    { type: "tủ lạnh", regex: /\b(tu lanh)\b/i },
    { type: "máy giặt", regex: /\b(may giat)\b/i },
    { type: "bếp / bình nóng lạnh", regex: /\b(bep|binh nong lanh|binh nuoc nong)\b/i },
];

export function extractIntentAndEntities(text: string, currentRoom?: string): IntentResult {
    const cleanText = splitUnspacedWords(normalizeTelexTypos(text));
    const normText = removeVietnameseDiacritics(cleanText);

    // 1. Trích xuất số phòng từ câu nói (nếu có)
    let roomNumber = currentRoom;
    const roomMatch = text.match(/(?:phòng|phong|p\.?)\s*(\d{3,4})/i) || normText.match(/(?:phong|p\.?)\s*(\d{3,4})/i);
    if (roomMatch && roomMatch[1]) {
        roomNumber = roomMatch[1];
    } else if (/^\d{3,4}$/.test(text.trim())) {
        roomNumber = text.trim();
    }

    // 2. Trích xuất loại thiết bị bị sự cố CỤ THỂ (Khớp trên normText)
    let deviceType: string | undefined;
    for (const item of DEVICE_PATTERNS) {
        if (item.regex.test(normText) || item.regex.test(text)) {
            deviceType = item.type;
            break;
        }
    }

    // 3. Phân loại Yêu cầu gặp Admin / Ban Quản Lý (ADMIN_REQUEST)
    const isAdminReq = /\b(admin|quản lý|quan ly|gặp admin|gap admin|gọi admin|goi admin|gặp quản lý|gap quan ly|gặp nhân viên|gap nhan vien|nhân viên|nhan vien|chủ nhà|chu nha|hỗ trợ trực tiếp|ho tro truc tiep)\b/i.test(text) || /\b(admin|quan ly|gap admin|goi admin|gap quan ly|gap nhan vien|nhan vien|chu nha|ho tro truc tiep)\b/i.test(normText);

    if (isAdminReq) {
        return {
            intent: "ADMIN_REQUEST",
            roomNumber,
            deviceType: "Yêu cầu gặp Admin / Ban quản lý",
            urgencyLevel: "HIGH",
            summary: `📩 YÊU CẦU GẶP ADMIN / QUẢN LÝ từ phòng ${roomNumber || "Chưa rõ"}: "${text}"`,
            recommendedButtons: [
                { title: "📞 Gọi Hotline Admin", payload: "Liên hệ" },
                { title: "🔧 Báo sự cố", payload: "Báo sự cố" },
            ],
        };
    }

    // 4. Phân loại Khẩn cấp (EMERGENCY) - Cháy, nổ, chập điện, cấp cứu
    const isEmergency = (/\b(chay nha|bi chay|dang chay|chap dien|hoa hoan|boc khoi|phat no|cuu voi|khan cap|bao chay|tai nan)\b/i.test(normText)) && !/\b(phong chay|pccc|chay nuoc)\b/i.test(normText);

    if (isEmergency) {
        return {
            intent: "EMERGENCY",
            roomNumber,
            deviceType: deviceType || "Sự cố khẩn cấp",
            urgencyLevel: "HIGH",
            summary: `🚨 CẢNH BÁO KHẨN CẤP tại phòng ${roomNumber || "Chưa rõ"}: "${text}"`,
            recommendedButtons: [
                { title: "📞 GỌI HOTLINE GẤP", payload: "Liên hệ" },
                { title: "🚨 An toàn PCCC", payload: "PCCC" },
            ],
        };
    }

    // 5. Phân loại Phàn nàn Tiếng ồn (NOISE_COMPLAINT)
    const isNoise = /\b(on|on ao|tieng on|hang xom on|mo nhac to|karaoke|hat ho)\b/i.test(normText);

    if (isNoise) {
        return {
            intent: "NOISE_COMPLAINT",
            roomNumber,
            deviceType: "tiếng ồn",
            urgencyLevel: "HIGH",
            summary: `🔊 PHÀN NÀN TIẾNG ỒN từ phòng ${roomNumber || "Chưa rõ"}: "${text}"`,
            recommendedButtons: [
                { title: "📜 Quy định tiếng ồn", payload: "Nội quy nhà" },
                { title: "📞 Báo Quản lý ngay", payload: "Liên hệ" },
            ],
        };
    }

    // 6. Phân loại Báo hỏng thiết bị (REPORT_ISSUE)
    const isIssue = /\b(hu|hong|hu hong|bi hu|bi hong|bao hu|su co|bao hong|khong lanh|bi ket|ro ri|chay nuoc|khong chay|mat dien|mat nuoc|goi tho|hong do|khong sang|tat|chay|khong len|hu den|hong den)\b/i.test(normText);

    if (isIssue || deviceType) {
        return {
            intent: "REPORT_ISSUE",
            roomNumber,
            deviceType,
            urgencyLevel: "MEDIUM",
            summary: `🛠️ BÁO SỰ CỐ TẠI PHÒNG ${roomNumber || "Chưa rõ"}: ${deviceType ? `Thiết bị [${deviceType}]` : "Chưa rõ thiết bị cụ thể"} - Nội dung: "${text}"`,
            recommendedButtons: [
                { title: "🔧 Quy trình bảo trì", payload: "Bảo trì" },
                { title: "📞 Gọi thợ hỗ trợ", payload: "Liên hệ" },
            ],
        };
    }

    // 7. Phân loại Chi phí / Hóa đơn (BILLING)
    const isBilling = /\b(tien dien|tien nuoc|phi dich vu|hoa don|tien nha|gia phong|chi phi)\b/i.test(normText);

    if (isBilling) {
        return {
            intent: "BILLING",
            roomNumber,
            deviceType: undefined,
            urgencyLevel: "LOW",
            summary: `💰 HỎI VỀ CHI PHÍ / HÓA ĐƠN: "${text}"`,
            recommendedButtons: [
                { title: "💰 Bảng phí dịch vụ", payload: "Chi phí" },
                { title: "📞 Nhờ hỗ trợ thu phí", payload: "Liên hệ" },
            ],
        };
    }

    // 8. Mặc định: Thông tin chung (GENERAL_FAQ)
    return {
        intent: "GENERAL_FAQ",
        roomNumber,
        deviceType,
        urgencyLevel: "LOW",
        summary: `Hỏi đáp thông tin chung: "${text}"`,
        recommendedButtons: DEFAULT_BUTTONS,
    };
}

export function getDefaultQuickReplies(): QuickReplyButton[] {
    return DEFAULT_BUTTONS;
}
