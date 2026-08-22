import { removeVietnameseDiacritics } from "../utils/textUtils";
import { loadStore, Chunk } from "./vectorStore";

export interface Bm25Result {
    chunk: Chunk;
    score: number; // Normalized BM25 score [0, 1]
}

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
    const norm = removeVietnameseDiacritics(text.toLowerCase());
    return norm.split(/[^\w\d]+/).filter((word) => word.length > 1);
}

export function searchBm25(queryText: string, topK: number = 4): Bm25Result[] {
    const chunks = loadStore();
    if (chunks.length === 0) return [];

    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0) return [];

    const docCount = chunks.length;
    let totalLength = 0;
    const docTokensList: string[][] = [];
    const docFreq = new Map<string, number>();

    // 1. Phân tích token cho từng chunk & tính Document Frequency (DF)
    for (const chunk of chunks) {
        const tokens = tokenize(chunk.text);
        docTokensList.push(tokens);
        totalLength += tokens.length;

        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
            docFreq.set(token, (docFreq.get(token) || 0) + 1);
        }
    }

    const avgDocLength = totalLength / docCount || 1;

    // 2. Tính điểm BM25 cho từng Chunk
    const scores: Array<{ chunk: Chunk; score: number }> = [];

    for (let i = 0; i < docCount; i++) {
        const chunk = chunks[i];
        const docTokens = docTokensList[i];
        const docLen = docTokens.length;

        // Đếm tần suất xuất hiện từ trong doc (TF)
        const tfMap = new Map<string, number>();
        for (const t of docTokens) {
            tfMap.set(t, (tfMap.get(t) || 0) + 1);
        }

        let bm25Score = 0;
        for (const qToken of queryTokens) {
            const df = docFreq.get(qToken) || 0;
            if (df === 0) continue;

            // IDF calculation
            const idf = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
            const tf = tfMap.get(qToken) || 0;

            const tfScore = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docLen / avgDocLength)));
            bm25Score += idf * tfScore;
        }

        scores.push({ chunk, score: bm25Score });
    }

    // 3. Chuẩn hóa điểm BM25 về khoảng [0, 1]
    const maxScore = Math.max(...scores.map((s) => s.score), 1);
    const normalized = scores.map((s) => ({
        chunk: s.chunk,
        score: s.score / maxScore,
    }));

    normalized.sort((a, b) => b.score - a.score);
    return normalized.slice(0, topK);
}
