import type { Bot } from "zalo-bot-js";
import { RagService } from "../services/rag";

export function setupMessageHandlers(bot: Bot) {
    // Lệnh /start, /ping, /id... giữ nguyên
    // ...

    // Xử lý tin nhắn văn bản tự do -> GỌI RAG TRẢ LỜI
    bot.on("text", async (message) => {
        const text = message.text || "";
        if (text.startsWith("/")) return; // Bỏ qua nếu là lệnh

        // Gửi hiệu ứng "Bot đang gõ..." (Tuỳ chọn)
        await message.replyAction("typing");

        // GỌI RAG SERVICE
        const aiReply = await RagService.answerQuestion(text);

        await bot.sendMessage(message.chat.id, aiReply);
    });
}