import fs from "fs";
import path from "path";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "../utils/textUtils";

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
    const cleanUserText = splitUnspacedWords(userText.toLowerCase().trim());
    const normUserText = removeVietnameseDiacritics(cleanUserText);
    
    // Sửa lỗi gõ Telex (vd: "dichh vụ" -> "dich vụ", "phongg" -> "phong", "dja chi" -> "da chi")
    const telexCleanText = splitUnspacedWords(normalizeTelexTypos(userText.toLowerCase().trim()));
    const telexNormText = removeVietnameseDiacritics(telexCleanText);

    if (!cleanUserText) return null;

    // Helper: test original, non-diacritic, and Telex-cleaned text against a regex
    const matches = (pattern: RegExp) => 
        pattern.test(cleanUserText) || 
        pattern.test(normUserText) || 
        pattern.test(telexCleanText) || 
        pattern.test(telexNormText);

    // 1. Khớp chủ đề "Khẩn cấp" (Báo sự cố khẩn cấp: cháy nhà, chập điện, rò rỉ điện...)
    if (matches(/\b(cháy nhà|chay nha|bị cháy|bi chay|đang cháy|dang chay|chập điện|chap dien|cứu hoả|cuu hoa|ngọn lửa|ngon lua|khẩn cấp|khan cap)\b|\bcháy\b|\bchay\b/i)) {
        const emergencyItem = items.find((i) => /^khẩn cấp$/i.test(i.topic.trim()) || /^khan cap$/i.test(removeVietnameseDiacritics(i.topic.trim())));
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
    if (matches(/phòng cháy|phong chay|pccc|quy định phòng cháy|quy dinh phong chay|nội quy phòng cháy|noi quy phong chay/i)) {
        addMatch(items.find((i) => /Phòng cháy chữa cháy/i.test(i.topic)));
    }

    if (matches(/thú cưng|thu cung|chó|cho|mèo|meo|pet|số người|so nguoi|mấy người|may nguoi|người ở|nguoi o/i)) {
        addMatch(items.find((i) => /Số người ở và Thú cưng/i.test(i.topic)));
    }

    if (matches(/\b(ồn|on|tiếng ồn|tieng on|hàng xóm ồn|hang xom on|mở nhạc to|mo nhac to|karaoke|hát hò|hat ho)\b/i)) {
        addMatch(items.find((i) => /Nội quy nhà/i.test(i.topic)));
    }

    if (matches(/nội quy|noi quy|quy định|quy dinh/i)) {
        addMatch(items.find((i) => /Nội quy nhà/i.test(i.topic)));
    }

    if (matches(/gửi xe|gui xe|xe máy|xe may|đỗ xe|do xe|phí xe|phi xe/i)) {
        addMatch(items.find((i) => /Thông tin Đỗ xe/i.test(i.topic)));
    }

    if (matches(/phí dịch vụ|phi dich vu|dịch vụ|dich vu|chi phí|chi phi|tiền điện|tien dien|tiền nước|tien nuoc/i)) {
        addMatch(items.find((i) => /Phí dịch vụ/i.test(i.topic)));
    }

    if (matches(/thanh toán|thanh toan|chuyển khoản|chuyen khoan|tiền mặt|tien mat|cú pháp thanh toán|cu phap thanh toan/i)) {
        addMatch(items.find((i) => /Phương thức thanh toán/i.test(i.topic)));
    }

    if (matches(/bảo trì|bao tri|báo hỏng|bao hong|hư hỏng|hu hong|bị hư|bi hu|bị hỏng|bi hong|\bhư\b|\bhong\b|báo hư|bao hu|sự cố|su co|máy lạnh|may lanh|máy giặt|may giat|tủ lạnh|tu lanh|khóa cửa|khoa cua|rò rỉ|ro ri/i)) {
        addMatch(items.find((i) => /Báo hỏng thiết bị/i.test(i.topic)));
    }

    if (matches(/thuê phòng|thue phong|phòng trống|phong trong|xem phòng|xem phong|đặt phòng|dat phong|xem nhà|xem nha|thuê nhà|thue nha/i)) {
        addMatch(items.find((i) => /Hỏi thuê phòng/i.test(i.topic)));
    }

    if (matches(/gia hạn|gia han|hạn hợp đồng|han hop dong/i)) {
        addMatch(items.find((i) => /Gia hạn hợp đồng/i.test(i.topic)));
    }

    if (matches(/trả phòng|tra phong|check-out|checkout|hoàn cọc|hoan coc|trả cọc|tra coc|bàn giao phòng|ban giao phong/i)) {
        addMatch(items.find((i) => /Trả phòng/i.test(i.topic)));
    }

    if (matches(/wifi|internet|mật khẩu wifi|mat khau wifi|pass wifi|tên wifi|ten wifi/i)) {
        addMatch(items.find((i) => /Wifi/i.test(i.topic)));
    }

    if (matches(/quên mật khẩu|quen mat khau|quên mã số|quen ma so|mất thẻ|mat the|mất thẻ từ|mat the tu|làm lại thẻ|lam lai the|mất chìa khóa|mat chia khoa/i)) {
        addMatch(items.find((i) => /Quên mật khẩu/i.test(i.topic)));
    }

    if (matches(/địa chỉ|dia chi|vị trí|vi tri|chỉ đường|chi duong|bản đồ|ban do|ở đâu|o dau|địa chỉ nhà|dia chi nha|tòa nhà ở đâu|toa nha o dau/i)) {
        addMatch(items.find((i) => /Địa chỉ/i.test(i.topic)));
    }

    if (matches(/hotline|liên hệ|lien he|số điện thoại|so dien thoai|chăm sóc khách hàng|cham soc khach hang|số quản lý|so quan ly/i)) {
        addMatch(items.find((i) => /Liên hệ/i.test(i.topic)));
    }

    if (matchedAnswers.length > 0) {
        return matchedAnswers.join("\n\n");
    }

    // 2. Thử khớp chính xác câu hỏi hoặc cụm từ dài trong danh sách questions (với cả dấu & không dấu)
    for (const item of items) {
        for (const q of item.questions) {
            const cleanQ = q.toLowerCase().replace(/[?.,!]/g, "").trim();
            const normQ = removeVietnameseDiacritics(cleanQ);

            if (cleanQ && cleanQ.length >= 3 && cleanUserText.length >= 3) {
                if (cleanUserText === cleanQ || (cleanUserText.length >= 4 && cleanQ.includes(cleanUserText))) {
                    return item.answer;
                }
                if (normUserText === normQ || (normUserText.length >= 4 && normQ.includes(normUserText))) {
                    return item.answer;
                }
            }
        }
    }

    // 3. Thử khớp tỷ lệ từ của câu hỏi (dùng từ không dấu)
    for (const item of items) {
        for (const q of item.questions) {
            const normWords = removeVietnameseDiacritics(q).split(/\s+/).filter((w) => w.length >= 3);
            let matchCount = 0;
            for (const word of normWords) {
                if (normUserText.includes(word)) {
                    matchCount++;
                }
            }
            if (normWords.length > 0 && matchCount / normWords.length >= 0.75) {
                return item.answer;
            }
        }
    }

    return null;
}
