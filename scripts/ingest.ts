import "dotenv/config";
import fs from "fs";
import path from "path";
import { getEmbeddingsBatch } from "../src/rag/embeddings";
import { saveStore, Chunk } from "../src/rag/vectorStore";

const KB_DIR = path.join(__dirname, "..", "data", "knowledge-base");

function chunkText(text: string): string[] {
    const rawParagraphs = text.split(/\n\s*\n\s*\n|\n(?=[A-ZÀ-Ỹ][^\n]{1,40}\nÁp dụng)/g);
    return rawParagraphs.map((p) => p.trim()).filter((p) => p.length > 20);
}

async function ingest() {
    if (!fs.existsSync(KB_DIR)) {
        console.error(`Không tìm thấy thư mục ${KB_DIR}.`);
        return;
    }

    const files = fs
        .readdirSync(KB_DIR)
        .filter((f) => f.endsWith(".txt") || f.endsWith(".md") || f.endsWith(".json"));

    if (files.length === 0) {
        console.error("Không có file tài liệu nào trong data/knowledge-base/");
        return;
    }

    const allChunks: { text: string; sourceFile: string }[] = [];

    for (const file of files) {
        const fullPath = path.join(KB_DIR, file);
        if (file.endsWith(".json")) {
            try {
                const jsonContent = JSON.parse(fs.readFileSync(fullPath, "utf8"));
                if (jsonContent.topics && Array.isArray(jsonContent.topics)) {
                    for (const topic of jsonContent.topics) {
                        if (topic.answer) {
                            const chunk = `${topic.name || topic.id}\n${topic.answer}`;
                            allChunks.push({ text: chunk, sourceFile: file });
                        }
                    }
                }
            } catch (err: any) {
                console.error(`[ingest] Lỗi đọc JSON file ${file}:`, err.message);
            }
        } else {
            const content = fs.readFileSync(fullPath, "utf8");
            const pieces = chunkText(content);
            console.log(`[ingest] ${file}: ${pieces.length} chunk`);
            for (const piece of pieces) {
                allChunks.push({ text: piece, sourceFile: file });
            }
        }
    }

    console.log(`[ingest] Tổng cộng ${allChunks.length} chunk, đang tạo embedding...`);

    const BATCH_SIZE = 100;
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    saveStore(result);
    console.log(`[ingest] Hoàn tất. Đã lưu ${result.length} chunk vào data/vector-store.json`);
}

ingest().catch((err) => {
    console.error("[ingest] Lỗi:", err.response?.data || err.message || err);
});