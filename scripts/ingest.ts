import "dotenv/config";
import fs from "fs";
import path from "path";
import { getEmbeddingsBatch } from "../src/rag/embeddings";
import { saveStore, Chunk } from "../src/rag/vectorStore";

/**
 * Chạy: npx ts-node scripts/ingest.ts
 * Đọc tất cả file .txt/.md trong data/knowledge-base/, chia nhỏ thành đoạn
 * (chunk) khoảng 800 ký tự, có overlap 100 ký tự để không mất ngữ cảnh ở
 * ranh giới đoạn, rồi tạo embedding và lưu vào data/vector-store.json.
 *
 * Chạy lại script này mỗi khi bạn thêm/sửa tài liệu trong knowledge-base/.
 */

const KB_DIR = path.join(__dirname, "..", "data", "knowledge-base");
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length);
        chunks.push(text.slice(start, end).trim());
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks.filter((c) => c.length > 0);
}

async function ingest() {
    if (!fs.existsSync(KB_DIR)) {
        console.error(`Không tìm thấy thư mục ${KB_DIR}. Tạo thư mục và bỏ file .txt/.md vào trước.`);
        return;
    }

    const files = fs
        .readdirSync(KB_DIR)
        .filter((f) => f.endsWith(".txt") || f.endsWith(".md"));

    if (files.length === 0) {
        console.error("Không có file .txt/.md nào trong data/knowledge-base/");
        return;
    }

    const allChunks: { text: string; sourceFile: string }[] = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(KB_DIR, file), "utf8");
        const pieces = chunkText(content);
        console.log(`[ingest] ${file}: ${pieces.length} chunk`);
        for (const piece of pieces) {
            allChunks.push({ text: piece, sourceFile: file });
        }
    }

    console.log(`[ingest] Tổng cộng ${allChunks.length} chunk, đang tạo embedding...`);

    // Tạo embedding theo batch nhỏ để tránh 1 request quá lớn
    const BATCH_SIZE = 20;
    const result: Chunk[] = [];

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);
        const embeddings = await getEmbeddingsBatch(
            batch.map((c) => c.text),
            "RETRIEVAL_DOCUMENT"
        );

        batch.forEach((c, idx) => {
            result.push({
                id: `${c.sourceFile}-${i + idx}`,
                text: c.text,
                sourceFile: c.sourceFile,
                embedding: embeddings[idx],
            });
        });

        console.log(`[ingest] Đã embed ${Math.min(i + BATCH_SIZE, allChunks.length)}/${allChunks.length}`);
    }

    saveStore(result);
    console.log(`[ingest] Hoàn tất. Đã lưu ${result.length} chunk vào data/vector-store.json`);
}

ingest().catch((err) => {
    console.error("[ingest] Lỗi:", err.response?.data || err.message || err);
});