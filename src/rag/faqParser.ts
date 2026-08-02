import fs from "fs";
import path from "path";

export interface FaqItem {
    topic: string;
    questions: string[];
    answer: string;
}

const FAQ_PATH = path.join(__dirname, "..", "..", "data", "knowledge-base", "faq.md");

export function loadFaqItems(): FaqItem[] {
    if (!fs.existsSync(FAQ_PATH)) return [];

    const content = fs.readFileSync(FAQ_PATH, "utf8");
    const blocks = content.split(/\n\s*\n(?=[A-ZÀ-Ỹ][^\n]{1,40}\n(?:Áp dụng|Nếu|Nguyên tắc))/g);

    const items: FaqItem[] = [];

    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const lines = trimmed.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        const topic = lines[0] || "";

        const questions: string[] = [];
        let isCollectingQuestions = false;
        let isCollectingAnswer = false;
        const answerLines: string[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            if (/^(?:Áp dụng|Nếu) (?:khi )?khách (?:hỏi|báo)?:/i.test(line)) {
                isCollectingQuestions = true;
                isCollectingAnswer = false;
                continue;
            }

            if (/^Chatbot\s*(?:trả lời)?:/i.test(line)) {
                isCollectingQuestions = false;
                isCollectingAnswer = true;
                continue;
            }

            if (isCollectingQuestions) {
                questions.push(line);
            } else if (isCollectingAnswer) {
                answerLines.push(line);
            }
        }

        const answer = answerLines.join("\n").trim();
        if (answer) {
            items.push({ topic, questions, answer });
        }
    }

    return items;
}

/**
 * Tìm câu trả lời từ file FAQ bằng thuật toán tìm kiếm từ khóa chính xác.
 */
export function findDirectFaqMatch(userText: string): string | null {
    const items = loadFaqItems();
    const cleanUserText = userText.toLowerCase().trim();

    if (!cleanUserText) return null;

    // 1. Khớp chủ đề "Khẩn cấp" (Báo sự cố khẩn cấp: cháy nhà, chập điện, rò rỉ điện...)
    if (/\b(cháy nhà|bị cháy|đang cháy|chập điện|cứu hoả|ngọn lửa|khẩn cấp)\b|\bcháy\b/i.test(cleanUserText)) {
        const emergencyItem = items.find((i) => /^khẩn cấp$/i.test(i.topic.trim()));
        if (emergencyItem) return emergencyItem.answer;
    }

    const matchedAnswers: string[] = [];
    const addedTopics = new Set<string>();

    const addMatch = (item: FaqItem | undefined) => {
        if (item && !addedTopics.has(item.topic)) {
            addedTopics.add(item.topic);
            matchedAnswers.push(item.answer);
        }
    };

    // 2. Thu thập tất cả các chủ đề khớp từ khóa trong tin nhắn (cho phép trả lời nhiều nội dung cùng lúc)
    if (/phòng cháy|pccc|quy định phòng cháy|nội quy phòng cháy/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Phòng cháy chữa cháy/i.test(i.topic)));
    }

    if (/thú cưng|chó|mèo|pet|số người|mấy người|người ở/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Số người ở và Thú cưng/i.test(i.topic)));
    }

    if (/ồn|tiếng ồn|hàng xóm ồn|mở nhạc to|karaoke|hát hò/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Nội quy nhà/i.test(i.topic)));
    }

    if (/nội quy|quy định/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Nội quy nhà/i.test(i.topic)));
    }

    if (/gửi xe|xe máy|đỗ xe|phí xe/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Thông tin Đỗ xe/i.test(i.topic)));
    }

    if (/phí dịch vụ|chi phí|tiền điện|tiền nước/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Phí dịch vụ/i.test(i.topic)));
    }

    if (/thanh toán|chuyển khoản|tiền mặt|cú pháp thanh toán/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Phương thức thanh toán/i.test(i.topic)));
    }

    if (/bảo trì|báo hỏng|hư hỏng|bị hư|bị hỏng|hư|hỏng|báo hư|sự cố|máy lạnh không|máy giặt|tủ lạnh|khóa cửa|rò rỉ/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Báo hỏng thiết bị/i.test(i.topic)));
    }

    if (/thuê phòng|phòng trống|xem phòng|đặt phòng|xem nhà|thuê nhà/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Hỏi thuê phòng/i.test(i.topic)));
    }

    if (/gia hạn|hạn hợp đồng/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Gia hạn hợp đồng/i.test(i.topic)));
    }

    if (/trả phòng|check-out|checkout|hoàn cọc|trả cọc|bàn giao phòng/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Trả phòng/i.test(i.topic)));
    }

    if (/wifi|internet|mật khẩu wifi|pass wifi|tên wifi/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Wifi/i.test(i.topic)));
    }

    if (/quên mật khẩu|quên mã số|mất thẻ|mất thẻ từ|làm lại thẻ|mất chìa khóa/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Quên mật khẩu/i.test(i.topic)));
    }

    if (/địa chỉ|vị trí|chỉ đường|bản đồ|ở đâu|địa chỉ nhà|tòa nhà ở đâu/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Địa chỉ/i.test(i.topic)));
    }

    if (/hotline|liên hệ|số điện thoại|chăm sóc khách hàng|số quản lý/i.test(cleanUserText)) {
        addMatch(items.find((i) => /Liên hệ/i.test(i.topic)));
    }

    if (matchedAnswers.length > 0) {
        return matchedAnswers.join("\n\n");
    }

    // 2. Thử khớp chính xác câu hỏi hoặc cụm từ dài trong danh sách questions
    for (const item of items) {
        for (const q of item.questions) {
            const cleanQ = q.toLowerCase().replace(/[?.,!]/g, "").trim();
            if (cleanQ && cleanQ.length >= 3 && cleanUserText.length >= 3 && (cleanUserText === cleanQ || (cleanUserText.length >= 4 && cleanQ.includes(cleanUserText)))) {
                return item.answer;
            }
        }
    }

    // 3. Thử khớp tỷ lệ từ của câu hỏi
    for (const item of items) {
        for (const q of item.questions) {
            const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
            let matchCount = 0;
            for (const word of words) {
                if (cleanUserText.includes(word)) {
                    matchCount++;
                }
            }
            if (words.length > 0 && matchCount / words.length >= 0.75) {
                return item.answer;
            }
        }
    }

    return null;
}
