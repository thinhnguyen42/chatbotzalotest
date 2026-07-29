import axios from "axios";

/**
 * Dùng Gemini Embedding API (model gemini-embedding-001) - cùng 1 API key
 * Gemini bạn đã có, không cần đăng ký thêm nhà cung cấp embedding riêng.
 * Lấy/kiểm tra key tại: https://aistudio.google.com/apikey
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const EMBEDDING_MODEL = "gemini-embedding-001";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function getEmbedding(
    text: string,
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
    if (!GEMINI_API_KEY) {
        throw new Error("Thiếu GEMINI_API_KEY trong .env");
    }

    const res = await axios.post(
        `${BASE_URL}/models/${EMBEDDING_MODEL}:embedContent`,
        {
            content: { parts: [{ text }] },
            taskType,
        },
        {
            headers: {
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
        }
    );

    return res.data.embedding.values;
}

// Batch nhiều đoạn 1 lần lúc ingest để tiết kiệm số lần gọi API
export async function getEmbeddingsBatch(
    texts: string[],
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
    if (!GEMINI_API_KEY) {
        throw new Error("Thiếu GEMINI_API_KEY trong .env");
    }

    const res = await axios.post(
        `${BASE_URL}/models/${EMBEDDING_MODEL}:batchEmbedContents`,
        {
            requests: texts.map((text) => ({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] },
                taskType,
            })),
        },
        {
            headers: {
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
        }
    );

    return res.data.embeddings.map((e: any) => e.values);
}