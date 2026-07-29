import fs from "fs";
import path from "path";

/**
 * Vector store tối giản: lưu toàn bộ chunk + embedding vào 1 file JSON.
 * Phù hợp khi KB còn nhỏ (vài trăm - vài nghìn đoạn). Khi KB lớn hơn
 * hoặc cần tốc độ/độ chính xác cao hơn, có thể thay thế bằng
 * Pinecone/Qdrant/pgvector mà không cần đổi interface bên ngoài (query/upsert).
 */

export interface Chunk {
    id: string;
    text: string;
    sourceFile: string;
    embedding: number[];
}

const STORE_PATH = path.join(__dirname, "..", "..", "data", "vector-store.json");

export function loadStore(): Chunk[] {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

export function saveStore(chunks: Chunk[]): void {
    fs.writeFileSync(STORE_PATH, JSON.stringify(chunks, null, 2), "utf8");
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface QueryResult {
    chunk: Chunk;
    score: number;
}

export function queryStore(
    queryEmbedding: number[],
    topK: number = 3
): QueryResult[] {
    const chunks = loadStore();

    const scored = chunks.map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}