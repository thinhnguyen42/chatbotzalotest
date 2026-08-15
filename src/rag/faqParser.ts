import fs from "fs";
import path from "path";
import { classifyTopicAndReply, loadFaqJsonData } from "../topicEngine";
import { removeVietnameseDiacritics, normalizeTelexTypos, splitUnspacedWords } from "../utils/textUtils";

export interface FaqItem {
    topic: string;
    questions: string[];
    answer: string;
}

const FAQ_MD_PATH = path.join(__dirname, "..", "..", "data", "knowledge-base", "faq.md");

export function loadFaqItems(): FaqItem[] {
    // 1. Ưu tiên đọc từ faq.json nếu tồn tại
    const jsonData = loadFaqJsonData();
    if (jsonData && jsonData.topics && jsonData.topics.length > 0) {
        return jsonData.topics
            .filter((t) => t.id !== "default")
            .map((t) => ({
                topic: t.name,
                questions: [...t.keywords, ...(t.typo_variations || [])],
                answer: t.answer,
            }));
    }

    // 2. Fallback đọc từ faq.md
    if (!fs.existsSync(FAQ_MD_PATH)) return [];

    const content = fs.readFileSync(FAQ_MD_PATH, "utf8");
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
 * Tìm câu trả lời bằng hệ thống topic classification & typo tolerance (Information Engineering)
 */
export function findDirectFaqMatch(userText: string): string | null {
    const topicResult = classifyTopicAndReply(userText);
    if (topicResult.matched) {
        return topicResult.answer;
    }
    return null;
}
