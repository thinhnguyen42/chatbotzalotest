import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "./utils/textUtils";

export type IntentType = "EMERGENCY" | "REPORT_ISSUE" | "NOISE_COMPLAINT" | "BILLING" | "ADMIN_REQUEST" | "GATE_ACCESS" | "GENERAL_FAQ";

export interface QuickReplyButton {
    title: string;
    payload: string;
}

export type GateDoorType = "CUA_TO" | "CUA_NHO" | "GARA" | "ROOM" | "UNSPECIFIED";
export type GateDirection = "IN" | "OUT" | "UNSPECIFIED";
export type GateAccessTarget = "ROOM" | "GATE" | "SHIPPER";

export interface IntentResult {
    intent: IntentType;
    roomNumber?: string;
    deviceType?: string;
    urgencyLevel: "HIGH" | "MEDIUM" | "LOW";
    summary: string;
    recommendedButtons: QuickReplyButton[];
    preferredTime?: string;
    phone?: string;
    gateTarget?: GateAccessTarget;
    doorType?: GateDoorType;
    direction?: GateDirection;
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

    // 3. Trích xuất số điện thoại (VD: 0912345678, 1234567890, SĐT 1234567890, sdt: 0987654321, 0912.345.678, +84912345678)
    let phone: string | undefined;
    const keywordPhoneMatch = text.match(/(?:sđt|sdt|dt|phone|dienthoai|so dien thoai)\s*:?\s*(\+?\d[\d\s.-]{8,14}\d)/i) || normText.match(/(?:sdt|dt|phone|dienthoai|so dien thoai)\s*:?\s*(\+?\d[\d\s.-]{8,14}\d)/i);
    if (keywordPhoneMatch && keywordPhoneMatch[1]) {
        phone = keywordPhoneMatch[1].replace(/[\s.-]/g, "");
    } else {
        const standalonePhoneMatch = text.match(/\b(0?\d{9,10})\b/);
        if (standalonePhoneMatch && standalonePhoneMatch[1]) {
            phone = standalonePhoneMatch[1];
        }
    }

    // 4. Trích xuất thời gian hỗ trợ (VD: 14h chiều nay, qua lúc 14h chiều nay, rảnh sáng mai 9h, qua lúc nào cũng được)
    let preferredTime: string | undefined;
    const timeMatch = text.match(/(?:qua lúc|qua kiểm tra|qua|rảnh|hỗ trợ|thời gian)\s+([^,.\n]+)/i) || text.match(/\b(\d{1,2}h(?:\d{2})?\s*(?:chiều|sáng|tối)?(?:\s*nay|\s*mai)?|sáng mai|chiều nay|tối nay|ngày mai|lúc nào cũng được|giờ hành chính)\b/i);
    if (timeMatch && timeMatch[1]) {
        preferredTime = timeMatch[1].trim();
    }

    // 5. Phân loại Yêu cầu gặp Admin / Ban Quản Lý (ADMIN_REQUEST)
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
            preferredTime,
            phone,
        };
    }

    // 6. Phân loại Khẩn cấp (EMERGENCY) - Cháy, nổ, chập điện, cấp cứu
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
            preferredTime,
            phone,
        };
    }

    // 6.5. Phân loại Yêu cầu mở cổng / mở phòng / Shipper / Gara / Mật khẩu / Mã PIN (GATE_ACCESS)
    const isGateAccess =
        /\b(mo cong|mo cua|quen the|quen the tu|vao nha|vao phong|lay passcode|lay ma cua|ma mo cua|passcode|password|mat khau|mat ma|ma pin|xin pass|cho pass|xin ma pin|cho ma pin|lay ma pin|xin mk|cho mk|lay mk|lay pass|xin mat khau|cho mat khau|cho tui mat khau|cho em mat khau|password cong|mat khau cong|mat ma cong|cho nguoi than|nguoi nha vao|muon vao|ban vao choi|shipper|ship hang|giao hang|ship do|nhan hang|don hang|vao gara|mo gara|quen pass|cua to|cua nho|cua gara|cua phong|chieu vao|chieu ra|chon cua khac|cua khac|doi cua|chon cua|mo cua khac|mo them cua)\b/i.test(normText)
        || /\b(mở cổng|mở cửa|quên thẻ|quên thẻ từ|vào nhà|vào phòng|lấy passcode|lấy mã cửa|mã mở cửa|passcode|password|mật khẩu|mật mã|mã pin|xin pass|cho pass|xin mã pin|cho mã pin|lấy mã pin|xin mk|cho mk|lấy mk|lấy pass|xin mật khẩu|cho mật khẩu|cho tui mật khẩu|cho em mật khẩu|cho người thân|người nhà vào|muốn vào|bạn vào chơi|shipper|ship hàng|giao hàng|ship đồ|nhận hàng|đơn hàng|vào gara|mở gara|quên pass|cửa to|cửa nhỏ|cửa gara|cửa phòng|chiều vào|chiều ra|chọn cửa khác|cửa khác|đổi cửa|chọn cửa|mở cửa khác|mở thêm cửa)\b/i.test(text);

    if (isGateAccess) {
        let doorType: GateDoorType = "UNSPECIFIED";
        let direction: GateDirection = "UNSPECIFIED";

        // 1. Phân loại Cửa / Cổng:
        const isCuaTo = /\b(cua to|cong to|cong lon|cua lon|mo cua to|mo cong lon)\b/i.test(normText)
            || /\b(cửa to|cổng to|cổng lớn|cửa lớn|mở cửa to|mở cổng lớn)\b/i.test(text);

        const isCuaNho = /\b(cua nho|cong nho|cua phu|mo cua nho|mo cong nho|shipper|ship hang|giao hang|ship do|nhan hang|don hang)\b/i.test(normText)
            || /\b(cửa nhỏ|cổng nhỏ|cửa phụ|mở cửa nhỏ|mở cổng nhỏ|shipper|ship hàng|giao hàng|ship đồ|nhận hàng|đơn hàng)\b/i.test(text);

        const isGara = /\b(gara|ham xe|ham gara|cua gara|mo gara|gui xe|cat xe)\b/i.test(normText)
            || /\b(gara|hầm xe|hầm gara|cửa gara|mở gara|gửi xe|cất xe)\b/i.test(text);

        const isRoom = /\b(cua phong|phong rieng|vao phong|mo phong|pass phong|ma phong)\b/i.test(normText)
            || /^(phong|cua phong)$/i.test(normText)
            || /\b(cửa phòng|phòng riêng|vào phòng|mở phòng|pass phòng|mã phòng)\b/i.test(text);

        if (isCuaTo) doorType = "CUA_TO";
        else if (isCuaNho) doorType = "CUA_NHO";
        else if (isGara) doorType = "GARA";
        else if (isRoom) doorType = "ROOM";
        else doorType = "UNSPECIFIED";

        // 2. Phân loại Chiều (Vào hay Ra):
        const isIn = /\b(chieu vao|di vao|ben ngoai vao|vao)\b/i.test(normText)
            || /\b(chiều vào|đi vào|bên ngoài vào|vào)\b/i.test(text);
        const isOut = /\b(chieu ra|di ra|ra ngoai|ra)\b/i.test(normText)
            || /\b(chiều ra|đi ra|ra ngoài|ra)\b/i.test(text);

        // Chỉ xác định chiều khi người dùng nói rõ chiều vào / chiều ra
        const hasExplicitIn = /\b(chieu vao|di vao|ben ngoai vao|in)\b/i.test(normText)
            || /\b(chieu\s*vao)\b/i.test(normText)
            || (doorType !== "UNSPECIFIED" && /\b(vao)\b/i.test(normText) && !/\b(vao phong|vao cong|vao gara|vao nha)\b/i.test(normText));
        const hasExplicitOut = /\b(chieu ra|di ra|ra ngoai|out)\b/i.test(normText)
            || /\b(chieu\s*ra)\b/i.test(normText)
            || (doorType !== "UNSPECIFIED" && /\b(ra)\b/i.test(normText));

        if (hasExplicitIn && !hasExplicitOut) {
            direction = "IN";
        } else if (hasExplicitOut && !hasExplicitIn) {
            direction = "OUT";
        } else {
            direction = "UNSPECIFIED";
        }

        let gateTarget: GateAccessTarget = "GATE";
        if (doorType === "ROOM") gateTarget = "ROOM";
        else if (doorType === "CUA_NHO") gateTarget = "SHIPPER";

        // Tạo danh sách button tương ứng theo trạng thái hội thoại:
        let recommendedButtons: QuickReplyButton[];
        if (doorType === "UNSPECIFIED") {
            recommendedButtons = [
                { title: "🚪 Cửa to", payload: "Cửa to" },
                { title: "🚶 Cửa nhỏ", payload: "Cửa nhỏ" },
                { title: "🚗 Cửa gara", payload: "Cửa gara" },
                { title: "🏠 Cửa phòng", payload: "Cửa phòng" },
            ];
        } else if (direction === "UNSPECIFIED") {
            const doorName = doorType === "CUA_TO" ? "Cửa to" : doorType === "CUA_NHO" ? "Cửa nhỏ" : doorType === "GARA" ? "Gara" : "Cửa phòng";
            recommendedButtons = [
                { title: `🟢 Chiều vào (${doorName})`, payload: `${doorName} chiều vào` },
                { title: `🔴 Chiều ra (${doorName})`, payload: `${doorName} chiều ra` },
                { title: "🔙 Chọn cửa khác", payload: "Lấy passcode" },
            ];
        } else {
            recommendedButtons = [
                { title: "🚪 Cửa to", payload: "Cửa to" },
                { title: "🚶 Cửa nhỏ", payload: "Cửa nhỏ" },
                { title: "🚗 Cửa gara", payload: "Cửa gara" },
                { title: "🏠 Cửa phòng", payload: "Cửa phòng" },
            ];
        }

        const doorLabel = doorType === "CUA_TO" ? "CỬA TO" : doorType === "CUA_NHO" ? "CỬA NHỎ" : doorType === "GARA" ? "GARA" : doorType === "ROOM" ? "PHÒNG" : "CHỌN CỬA";
        const dirLabel = direction === "IN" ? "VÀO" : direction === "OUT" ? "RA" : "CHƯA CHỌN CHIỀU";

        return {
            intent: "GATE_ACCESS",
            roomNumber,
            deviceType: undefined,
            urgencyLevel: "MEDIUM",
            summary: `🔑 YÊU CẦU PASSCODE (${doorLabel} - ${dirLabel}) từ phòng ${roomNumber || "Chưa rõ"}: "${text}"`,
            recommendedButtons,
            preferredTime,
            phone,
            gateTarget,
            doorType,
            direction,
        };
    }

    // 7. Phân loại Phàn nàn Tiếng ồn (NOISE_COMPLAINT)
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
            preferredTime,
            phone,
        };
    }

    // 8. Phân loại Báo hỏng thiết bị (REPORT_ISSUE)
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
            preferredTime,
            phone,
        };
    }

    // 9. Phân loại Chi phí / Hóa đơn (BILLING)
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
            preferredTime,
            phone,
        };
    }

    // 10. Mặc định: Thông tin chung (GENERAL_FAQ)
    return {
        intent: "GENERAL_FAQ",
        roomNumber,
        deviceType,
        urgencyLevel: "LOW",
        summary: `Hỏi đáp thông tin chung: "${text}"`,
        recommendedButtons: DEFAULT_BUTTONS,
        preferredTime,
        phone,
    };
}

export function getDefaultQuickReplies(): QuickReplyButton[] {
    return DEFAULT_BUTTONS;
}
