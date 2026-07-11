import { ZaloApiService } from "../services/zalo-api";
import { RagService } from "../services/rag";

// Đọc danh sách UID được phép gửi file từ .env
const WHITELIST_USERS = (process.env.WHITELIST_USERS || "").split(",").map(id => id.trim());

export class WebhookHandler {
  /**
   * Xử lý payload sự kiện từ Zalo OA Webhook gửi về
   */
  static async handleEvent(payload: any) {
    const eventName = payload.event_name;

    // Chỉ xử lý sự kiện Khách hàng gửi tin nhắn cho OA
    if (eventName === "user_send_message") {
      const senderId = payload.sender?.id;
      const message = payload.message;
      const text = message?.text || "";
      const attachments = message?.attachments;

      if (!senderId) return;

      // Lấy tên khách hàng từ Zalo API
      const userProfile = await ZaloApiService.getUserProfile(senderId);
      console.log(`[TIN NHẮN] Từ ${userProfile.displayName} (${senderId}): ${text}`);

      // =========================================================
      // TRƯỜNG HỢP 1: KHÁCH HÀNG GỬI FILE TÀI LIỆU (WORD, PDF...)
      // =========================================================
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          if (att.type === "file") {
            const fileName = att.payload?.name || "unknown";
            const fileUrl = att.payload?.url;

            console.log(`[FILE] Nhận được file: ${fileName} -> ${fileUrl}`);

            // KIỂM TRA WHITELIST UID
            if (!WHITELIST_USERS.includes(senderId)) {
              await ZaloApiService.sendTextMessage(
                senderId,
                `Xin lỗi ${userProfile.displayName}, bạn không có quyền gửi file vào hệ thống này.`
              );
              continue;
            }

            // ✅ Người dùng trong whitelist → Xử lý file
            await ZaloApiService.sendTextMessage(
              senderId,
              `📂 Đã nhận file "${fileName}"!\nĐang tải và phân tích nội dung, vui lòng đợi...`
            );

            try {
              // Import lazy để tránh circular dependency
              const { FileService } = await import("../services/file");
              const { summary, chunks } = await FileService.processFile(
                fileUrl,
                fileName,
                userProfile.displayName
              );

              // Gửi kết quả tóm tắt cho admin
              await ZaloApiService.sendTextMessage(
                senderId,
                `✅ Đã nạp tài liệu thành công!\n` +
                `📊 Số đoạn kiến thức: ${chunks} chunks\n\n` +
                `${summary}\n\n` +
                `💬 Khách hàng có thể đặt câu hỏi về tài liệu này ngay bây giờ!`
              );
            } catch (err: any) {
              console.error("[FILE] Lỗi xử lý file:", err);
              await ZaloApiService.sendTextMessage(
                senderId,
                `❌ Lỗi khi xử lý file "${fileName}":\n${err.message}\n\nVui lòng kiểm tra lại file và thử lại.`
              );
            }
          }
        }
        return;
      }

      // =========================================================
      // TRƯỜNG HỢP 2: TIN NHẮN VĂN BẢN → GỌI AI TRẢ LỜI
      // =========================================================
      if (text) {
        console.log(`[AI] Đang xử lý câu hỏi: "${text}"`);

        // Gọi RAG Service (Gemini) để tạo câu trả lời
        const aiReply = await RagService.answerQuestion(text);

        await ZaloApiService.sendTextMessage(senderId, aiReply);
        console.log(`[AI] Đã gửi trả lời tới ${userProfile.displayName}`);
      }
    }
  }
}