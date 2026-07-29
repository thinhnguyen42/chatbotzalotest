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
    if (/\b(phòng cháy|pccc|quy định phòng cháy|nội quy phòng cháy)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /^phòng cháy$/i.test(i.topic.trim())));
    }

    if (/\b(hút thuốc|thuốc lá)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /phòng cháy|hút thuốc/i.test(i.topic) || i.questions.some((q) => q.includes("hút thuốc"))));
    }

    if (/\b(thú cưng|chó|mèo|pet)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /thú cưng/i.test(i.topic)));
    }

    if (/\b(ồn|ồn ào|tiếng ồn|hàng xóm ồn|mở nhạc to|karaoke|hát hò)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /tiếng ồn|ồn/i.test(i.topic)));
    }

    if (/\b(nội quy|quy định)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /nội quy/i.test(i.topic)));
    }

    if (/\b(điện|giá điện|tiền điện)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /tiền điện/i.test(i.topic)));
    }

    if (/\b(nước|tiền nước|giá nước)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /tiền nước/i.test(i.topic)));
    }

    if (/\b(gửi xe|xe máy|đỗ xe|phí xe)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /gửi xe/i.test(i.topic)));
    }

    if (/\b(dịch vụ|phí dịch vụ|wifi)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /phí dịch vụ/i.test(i.topic)));
    }

    if (/\b(biên lai|hóa đơn|vat|biên nhận|gửi biên lai)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /gửi biên lai|hóa đơn/i.test(i.topic)));
    }

    if (/\b(thanh toán|chuyển khoản|tiền mặt|cú pháp thanh toán)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /^thanh toán$/i.test(i.topic.trim())));
    }

    if (/\b(chưa thanh toán|gia hạn|xin gia hạn|đóng trễ|khất)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /chưa thanh toán/i.test(i.topic)));
    }

    if (/\b(tổng chi phí|hàng tháng đóng những gì|chi phí hàng tháng|khoản đóng hàng tháng)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /tổng chi phí/i.test(i.topic)));
    }

    if (/\b(báo hỏng|máy lạnh|máy giặt|tủ lạnh|khóa cửa|đèn hỏng|mất điện|mất nước)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /báo hỏng/i.test(i.topic)));
    }

    if (/\b(giờ giấc|mấy giờ|giới nghiêm)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /giờ giấc/i.test(i.topic)));
    }

    if (/\b(khách|người lạ|bạn đến chơi|dẫn bạn)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /khách ghé chơi/i.test(i.topic)));
    }

    if (/\b(hành lang|để giày|ngoài cửa)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /hành lang/i.test(i.topic)));
    }

    if (/\b(chất cấm|ma túy|cần sa|bóng cười)\b/i.test(cleanUserText)) {
        addMatch(items.find((i) => /chất cấm/i.test(i.topic)));
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
