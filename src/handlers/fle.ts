import type { Bot } from "zalo-bot-js";
import { CONFIG } from "../config";
import { RagService } from "../services/rag";
import pdf from "pdf-parse"; // Thư viện đọc chữ từ PDF

export function setupFileHandlers(bot: Bot) {
    bot.on("message", async (message) => {
        const senderId = message.fromUser?.id || "";
        const rawData = message.raw;

        if (rawData?.message?.attachments) {
            for (const attachment of rawData.message.attachments) {
                if (attachment.type === "file") {
                    const fileUrl = attachment.payload.url;
                    const fileName = attachment.payload.name;

                    // BƯỚC 1: Kiểm tra Whitelist Admin
                    if (senderId && CONFIG.WHITELIST_USERS.includes(senderId)) {
                        await bot.sendMessage(
                            message.chat.id,
                            `[Admin ID: ${senderId}] Đang tải file "${fileName}" và nạp vào bộ nhớ RAG...`
                        );

                        try {
                            // BƯỚC 2: Tải file từ Zalo URL về
                            const response = await fetch(fileUrl);
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);

                            let extractedText = "";

                            // Xử lý bóc tách chữ tùy theo đuôi file
                            if (fileName.endsWith(".pdf")) {
                                const pdfData = await pdf(buffer);
                                extractedText = pdfData.text;
                            } else if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
                                extractedText = buffer.toString("utf-8");
                            } else {
                                await bot.sendMessage(message.chat.id, `[Hiện tại RAG chỉ hỗ trợ tốt nhất file .PDF, .TXT hoặc .MD. File "${fileName}" có thể không đọc được.`);
                                return;
                            }

                            // BƯỚC 3: Đưa văn bản vào RAG Pipeline
                            const chunksCount = await RagService.ingestDocument(extractedText, fileName);

                            await bot.sendMessage(
                                message.chat.id,
                                `[Đã nạp kiến thức thành công!\n File: ${fileName}\n Số đoạn kiến thức (Chunks): ${chunksCount}\n\n Bạn có thể hỏi thử các kiến thức trong file này ngay!]`
                            );
                        } catch (err) {
                            console.error("Lỗi nạp file RAG:", err);
                            await bot.sendMessage(message.chat.id, `[Lỗi khi đọc file "${fileName}". Hãy chắc chắn file không bị đặt mật khẩu.`);
                        }
                    } else {
                        await bot.sendMessage(message.chat.id, `[Bạn không có quyền Admin để nạp kiến thức vào hệ thống.]`);
                    }
                }
            }
        }
    });
}