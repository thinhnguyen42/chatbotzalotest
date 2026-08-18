import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";

export type IntentType = "EMERGENCY" | "REPORT_ISSUE" | "NOISE_COMPLAINT" | "BILLING" | "GENERAL_FAQ";

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

const DEVICE_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    { type: "điều hòa", regex: /\b(điều hòa|máy lạnh|dieu hoa|may lanh)\b/i },
    { type: "khóa cửa", regex: /\b(khóa cửa|khoa cua|ổ khóa|o khoa|thẻ từ|the tu|vân tay)\b/i },
    { type: "mất điện / chập điện", regex: /\b(mất điện|mat dien|chập điện|chap dien|máy phát|ổ điện|o dien)\b/i },
    { type: "đường nước / rò rỉ", regex: /\b(rò rỉ|ro ri|chảy nước|chay nuoc|vòi nước|voi nuoc|mất nước|mat nuoc|bồn cầu|bon cau|tắc cống|tac cong)\b/i },
    { type: "tủ lạnh", regex: /\b(tủ lạnh|tu lanh)\b/i },
    { type: "máy giặt", regex: /\b(máy giặt|may giat)\b/i },
    { type: "bếp / bình nóng lạnh", regex: /\b(bếp|bep|bình nóng lạnh|binh nong lanh|bình nước nóng)\b/i },
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

    // 2. Trích xuất loại thiết bị bị sự cố
    let deviceType: string | undefined;
    for (const item of DEVICE_PATTERNS) {
        if (item.regex.test(text) || item.regex.test(normText)) {
            deviceType = item.type;
            break;
        }
    }

    // 3. Phân loại Khẩn cấp (EMERGENCY) - Cháy, nổ, chập điện, cấp cứu (không nhầm với chảy nước)
    const isEmergency = (/\b(cháy nhà|bị cháy|đang cháy|chập điện|hỏa hoạn|bốc khói|phát nổ|cứu|khẩn cấp|báo cháy|tai nạn)\b/i.test(text) || /\b(chay nha|bi chay|dang chay|chap dien|hoa hoan|boc khoi|phat no|cuu voi|khan cap|bao chay|tai nan)\b/i.test(normText)) && !/\b(phòng cháy|pccc|chảy nước|chay nuoc)\b/i.test(text) && !/\b(chay nuoc)\b/i.test(normText);

    if (isEmergency) {
        return {
            intent: "EMERGENCY",
            roomNumber,
            deviceType,
            urgencyLevel: "HIGH",
            summary: `🚨 CẢNH BÁO KHẨN CẤP tại phòng ${roomNumber || "Chưa rõ"}: "${text}"`,
            recommendedButtons: [
                { title: "📞 GỌI HOTLINE GẤP", payload: "Liên hệ" },
                { title: "🚨 An toàn PCCC", payload: "PCCC" },
            ],
        };
    }

    // 4. Phân loại Phàn nàn Tiếng ồn (NOISE_COMPLAINT)
    const isNoise = /\b(ồn|ồn ào|tiếng ồn|hàng xóm ồn|mở nhạc to|karaoke|hát hò)\b/i.test(text) || /\b(on|on ao|tieng on|hang xom on|mo nhac to|karaoke|hat ho)\b/i.test(normText);

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

    // 5. Phân loại Báo hỏng thiết bị (REPORT_ISSUE)
    const isIssue = /\b(hư|hỏng|hư hỏng|bị hư|bị hỏng|báo hư|sự cố|báo hỏng|không lạnh|bị kẹt|rò rỉ|chảy nước|không chạy|mất điện|mất nước)\b/i.test(text) || /\b(hu|hong|hu hong|bi hu|bi hong|bao hu|su co|bao hong|khong lanh|bi ket|ro ri|chay nuoc|khong chay|mat dien|mat nuoc)\b/i.test(normText);

    if (isIssue || deviceType) {
        return {
            intent: "REPORT_ISSUE",
            roomNumber,
            deviceType,
            urgencyLevel: "MEDIUM",
            summary: `🛠️ BÁO SỰ CỐ TẠI PHÒNG ${roomNumber || "Chưa rõ"}: ${deviceType ? `Thiết bị [${deviceType}]` : "Sự cố kỹ thuật"} - Nội dung: "${text}"`,
            recommendedButtons: [
                { title: "🔧 Quy trình bảo trì", payload: "Bảo trì" },
                { title: "📞 Gọi thợ hỗ trợ", payload: "Liên hệ" },
            ],
        };
    }

    // 6. Phân loại Chi phí / Hóa đơn (BILLING)
    const isBilling = /\b(tiền điện|tiền nước|phí dịch vụ|hóa đơn|tiền nhà|giá phòng|chi phí)\b/i.test(text) || /\b(tien dien|tien nuoc|phi dich vu|hoa don|tien nha|gia phong|chi phi)\b/i.test(normText);

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

    // 7. Mặc định: Thông tin chung (GENERAL_FAQ)
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
