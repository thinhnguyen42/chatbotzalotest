import fs from "fs";
import path from "path";
import {
    removeVietnameseDiacritics,
    normalizeTelexTypos,
    splitUnspacedWords,
    levenshteinDistance
} from "./utils/textUtils";

export interface JsonFaqTopic {
    id: string;
    name: string;
    keywords: string[];
    typo_variations?: string[];
    answer: string;
}

export interface JsonFaqData {
    topics: JsonFaqTopic[];
}

const FAQ_JSON_PATH = path.join(__dirname, "..", "data", "knowledge-base", "faq.json");

let cachedFaqData: JsonFaqData | null = null;

export function loadFaqJsonData(): JsonFaqData {
    if (cachedFaqData) return cachedFaqData;

    if (fs.existsSync(FAQ_JSON_PATH)) {
        try {
            const raw = fs.readFileSync(FAQ_JSON_PATH, "utf8");
            cachedFaqData = JSON.parse(raw);
            return cachedFaqData!;
        } catch (err: any) {
            console.error("[topicEngine] Error reading faq.json:", err.message);
        }
    }

    return { topics: [] };
}

/**
 * Information Engineering NLP Sub-branch Typo Normalizer
 * Maps common Vietnamese QWERTY key swaps and Telex errors:
 * - "xig chao" / "xuao chao" / "chin chao" -> "xin chao"
 * - "dia cho" / "diachj" -> "dia chi"
 * - "noiquui" / "qui dinh" -> "noi quy" / "quy dinh"
 * - "wjfi" / "wifii" -> "wifi"
 * - "bao hongg" -> "bao hong"
 */
export function correctTypoVariants(str: string): string {
    if (!str) return "";
    let s = str.toLowerCase();

    const TYPO_RULES: [RegExp, string][] = [
        [/\b(xig|xuao|xao|chin|xung|xib)\s+(chao|chaoo)\b/gi, "xin chao"],
        [/\b(chao|chaoo)\s+(boot|bot|btt)\b/gi, "chao bot"],
        [/\b(helo|helllo|helu|heluu|hix|hiii+)\b/gi, "hello"],
        [/\bdia\s+(cho|chu|chj|chii|chia)\b/gi, "dia chi"],
        [/\btoa\s+(nha|nhja|nhha)\s+o\s+(dau|daau)\b/gi, "toa nha o dau"],
        [/\bnoi\s+(quui|quyn|quyy|qui)\b/gi, "noi quy"],
        [/\b(qui|quyy)\s+(dinh|dinjh|dinhj)\b/gi, "quy dinh"],
        [/\b(wjfi|wfi|wifii|wi-fi)\b/gi, "wifi"],
        [/\bmat\s+khau\s+(wf|wif)\b/gi, "mat khau wifi"],
        [/\bbao\s+(hongg|hng|honng)\b/gi, "bao hong"],
        [/\b(huu|hux)\s+hong\b/gi, "hu hong"],
        [/\bphong\s+chay\s+(chua\s+chay)?\b/gi, "pccc"],
    ];

    for (const [pattern, replacement] of TYPO_RULES) {
        s = s.replace(pattern, replacement);
    }

    return s;
}

/**
 * Fuzzy check if input matches keywords using token & phrase Levenshtein distance
 */
function fuzzyMatchKeywords(normalizedInput: string, keywords: string[]): boolean {
    if (!normalizedInput || !keywords.length) return false;

    const inputClean = normalizedInput.replace(/[?.,!]/g, "").trim();
    const inputWords = inputClean.split(/\s+/).filter((w) => w.length >= 1);

    for (const kw of keywords) {
        const cleanKw = kw.replace(/[?.,!]/g, "").trim();
        const normKw = removeVietnameseDiacritics(correctTypoVariants(normalizeTelexTypos(cleanKw))).trim();
        if (!normKw) continue;

        // 1. Direct word-boundary match or string equality
        const regex = new RegExp(`\\b${normKw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
        if (inputClean === normKw || regex.test(inputClean)) return true;

        const kwWords = normKw.split(/\s+/).filter((w) => w.length >= 1);

        // 2. Single word fuzzy check (exact for <= 4 chars unless in typo_variations, distance 1 for longer words)
        if (kwWords.length === 1) {
            const targetWord = kwWords[0];
            const maxDist = targetWord.length <= 4 ? 0 : 1;

            for (const userWord of inputWords) {
                if (Math.abs(userWord.length - targetWord.length) <= maxDist) {
                    if (levenshteinDistance(userWord, targetWord) <= maxDist) {
                        return true;
                    }
                }
            }
        } else if (kwWords.length > 1 && inputWords.length >= kwWords.length) {
            // 3. Phrase sliding window match
            const windowSize = kwWords.length;
            for (let i = 0; i <= inputWords.length - windowSize; i++) {
                const phrase = inputWords.slice(i, i + windowSize).join(" ");
                const maxDist = normKw.length <= 7 ? 1 : 2;
                if (levenshteinDistance(phrase, normKw) <= maxDist) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Classify user input into specific topic branches using Information Engineering NLP
 * Supports multi-intent query handling when a user asks 2 or more problems in a single sentence.
 * Zero token consumption (pure local execution).
 */
export function classifyTopicAndReply(userText: string): { topicId: string; answer: string; matched: boolean } {
    const data = loadFaqJsonData();
    const defaultTopic = data.topics.find((t) => t.id === "default");
    const defaultAnswer = defaultTopic?.answer || "Quản gia AI xin lỗi bạn: Dạ, câu hỏi này nằm ngoài phạm vi dữ liệu hiện tại của em rồi ạ.";

    const trimmed = userText.trim();
    if (!trimmed) {
        return { topicId: "default", answer: defaultAnswer, matched: false };
    }

    // Process & normalize text
    const cleanText = splitUnspacedWords(normalizeTelexTypos(trimmed));
    const typoCorrected = correctTypoVariants(cleanText);
    const normInput = removeVietnameseDiacritics(typoCorrected);

    // 1. Check Greeting sub-branch first
    const greetingTopic = data.topics.find((t) => t.id === "greeting");
    if (greetingTopic) {
        const greetingKeywords = [...greetingTopic.keywords, ...(greetingTopic.typo_variations || [])];
        if (fuzzyMatchKeywords(normInput, greetingKeywords)) {
            console.log(`[topicEngine] Topic matched: greeting for input "${userText}"`);
            return { topicId: "greeting", answer: greetingTopic.answer, matched: true };
        }
    }

    // 2. Check Emergency sub-branch
    const emergencyTopic = data.topics.find((t) => t.id === "emergency");
    if (emergencyTopic) {
        const emergencyKeywords = [...emergencyTopic.keywords, ...(emergencyTopic.typo_variations || [])];
        if (fuzzyMatchKeywords(normInput, emergencyKeywords)) {
            console.log(`[topicEngine] Topic matched: emergency for input "${userText}"`);
            return { topicId: "emergency", answer: emergencyTopic.answer, matched: true };
        }
    }

    // If message is random noise (1 char or single number) and not a greeting/emergency
    if (trimmed.length <= 1 || /^\d{1,2}$/.test(trimmed)) {
        return { topicId: "default", answer: defaultAnswer, matched: false };
    }

    // 3. Multi-intent Matching: Check all specific topics and collect ALL matched categories
    const matchedTopics: JsonFaqTopic[] = [];

    for (const topic of data.topics) {
        if (topic.id === "greeting" || topic.id === "emergency" || topic.id === "default") continue;

        const allKeywords = [...topic.keywords, ...(topic.typo_variations || [])];
        if (fuzzyMatchKeywords(normInput, allKeywords)) {
            console.log(`[topicEngine] Multi-intent matched topic: ${topic.id} (${topic.name}) for input "${userText}"`);
            matchedTopics.push(topic);
        }
    }

    if (matchedTopics.length > 0) {
        // Deduplicate answers and combine them cleanly with a divider
        const uniqueAnswers = Array.from(new Set(matchedTopics.map((t) => t.answer)));
        const combinedAnswers = uniqueAnswers.join("\n\n---\n\n");
        const combinedTopicIds = matchedTopics.map((t) => t.id).join(", ");
        return { topicId: combinedTopicIds, answer: combinedAnswers, matched: true };
    }

    // 4. Default Category (Fallback / Apology)
    console.log(`[topicEngine] No specific topic matched for "${userText}". Returning Default Category.`);
    return { topicId: "default", answer: defaultAnswer, matched: false };
}
