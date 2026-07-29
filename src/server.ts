import "dotenv/config";
import path from "path";
import express, { Request, Response } from "express";
import { sendTextMessage, notifyAdmin, sendImageMessage, sendHouseRulesImage } from "./zaloClient";
import { generateReply } from "./replyEngine";
import { verifyZaloSignature } from "./verifyZaloSignature";

const app = express();

// Capture raw body string (cần cho việc verify chữ ký X-ZEvent-Signature)
// Bắt buộc đặt option "verify" này TRƯỚC khi Express parse JSON
app.use(
    express.json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf.toString("utf8");
        },
    })
);

// Serve file tĩnh trong /public tại domain root
// -> file public/zalo-verification.html sẽ truy cập được tại
//    https://your-domain.com/zalo-verification.html
// Nhớ ĐỔI TÊN file trong /public thành đúng tên mà Zalo yêu cầu
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;

// Zalo sẽ POST vào đây mỗi khi có sự kiện (tin nhắn, follow, ...)
app.post("/webhook", verifyZaloSignature, async (req: Request, res: Response) => {
    // Trả 200 ngay để Zalo không bị timeout / gửi lại request
    res.sendStatus(200);

    const event = req.body;
    console.log("[webhook] Nhận event:", JSON.stringify(event));

    try {
        // Sự kiện người dùng gửi tin nhắn văn bản cho OA
        if (event.event_name === "user_send_text") {
            const userId = event.sender?.id;
            const userText = event.message?.text;

            if (userId && userText) {
                const replyText = await generateReply(userText);
                await sendTextMessage(userId, replyText);

                // Nếu khách hỏi về Nội quy -> Tự động upload & gửi kèm hình ảnh noiQuy.jpg
                const isHouseRules = /\b(nội quy|quy định)\b/i.test(userText);
                if (isHouseRules) {
                    console.log(`[server] Gửi hình ảnh Bảng nội quy noiQuy.jpg đính kèm cho user ${userId}...`);
                    await sendHouseRulesImage(userId);
                }

                // Tự động gửi thông báo khẩn cấp, phàn nàn tiếng ồn hoặc báo hỏng cho Admin
                const isEmergency = (/\b(cháy nhà|bị cháy|đang cháy|chập điện|hỏa hoạn|nổ|cứu|khẩn cấp|rò rỉ|báo cháy|tai nạn)\b|\bcháy\b/i.test(userText)) && !/\b(phòng cháy|pccc)\b/i.test(userText);
                const isNoiseComplaint = /\b(ồn|ồn ào|tiếng ồn|hàng xóm ồn|mở nhạc to|karaoke|hát hò)\b/i.test(userText);
                const isRoomNumber = /^(phòng\s*|p\.?\s*)?\d{3,4}$/i.test(userText.trim());
                const isIssueReport = /hỏng|mất điện|mất nước|sự cố|báo hỏng|không lạnh|bị kẹt|rò rỉ/i.test(userText);

                if (isEmergency) {
                    const emergencyNotice = `🚨🚨🚨 [CẢNH BÁO KHẨN CẤP - XỬ LÝ NGAY] 🚨🚨🚨\n👤 Người gửi ID: ${userId}\n💬 Nội dung tin nhắn: "${userText}"\n⏰ Thời gian: ${new Date().toLocaleString("vi-VN")}\n👉 Ban quản lý/Admin vui lòng liên hệ khách hàng hoặc kiểm tra xử lý gấp!`;
                    console.log(`[server] Gửi CẢNH BÁO KHẨN CẤP cho Admin:`, emergencyNotice);
                    await notifyAdmin(emergencyNotice);
                } else if (isNoiseComplaint) {
                    const noiseNotice = `🔊🔊🔊 [PHÀN NÀN TIẾNG ỒN - XỬ LÝ NGAY] 🔊🔊🔊\n👤 Khách hàng ID: ${userId}\n💬 Nội dung phàn nàn: "${userText}"\n⏰ Thời gian: ${new Date().toLocaleString("vi-VN")}\n👉 Admin/Ban quản lý vui lòng kiểm tra nhắc nhở khu vực gây ồn!`;
                    console.log(`[server] Gửi thông báo PHÀN NÀN TIẾNG ỒN cho Admin:`, noiseNotice);
                    await notifyAdmin(noiseNotice);
                } else if (isRoomNumber || isIssueReport) {
                    const adminNotice = `🔔 [YÊU CẦU HỖ TRỢ / BÁO HỎNG]\n👤 Khách hàng ID: ${userId}\n💬 Nội dung: "${userText}"\n⏰ Thời gian: ${new Date().toLocaleString("vi-VN")}`;
                    console.log(`[server] Gửi thông báo hỗ trợ cho Admin:`, adminNotice);
                    await notifyAdmin(adminNotice);
                }
            }
        }

        // Sự kiện người dùng follow OA
        if (event.event_name === "follow") {
            const userId = event.follower?.id;
            if (userId) {
                await sendTextMessage(userId, "Cảm ơn bạn đã quan tâm OA của mình! 🎉");
            }
        }

        // Bạn có thể xử lý thêm các event_name khác ở đây:
        // user_send_image, user_send_sticker, user_click_button, ...
    } catch (err) {
        console.error("[webhook] Lỗi xử lý event:", err);
    }
});

// Endpoint kiểm tra server sống
app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.listen(PORT, () => {
    console.log(`Bot server đang chạy tại http://localhost:${PORT}`);
});