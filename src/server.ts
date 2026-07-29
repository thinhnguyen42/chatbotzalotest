import "dotenv/config";
import path from "path";
import express, { Request, Response } from "express";
import { sendTextMessage } from "./zaloClient";
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