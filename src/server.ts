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

const PORT = process.env.PORT || 3002;

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
                const isIssueReport = /\b(hư|hỏng|hư hỏng|bị hư|bị hỏng|báo hư|sự cố|báo hỏng|không lạnh|bị kẹt|rò rỉ|chảy nước|không chạy|mất điện|mất nước)\b/i.test(userText);

                if (isEmergency) {
                    const emergencyNotice = `[CANH BAO KHAN CAP - XU LY NGAY]\nNguoi gui ID: ${userId}\nNoi dung tin nhan: "${userText}"\nThoi gian: ${new Date().toLocaleString("vi-VN")}\nBan quan ly/Admin vui long lien he khach hang hoac kiem tra xu ly gap!`;
                    console.log(`[server] Gửi CANH BAO KHAN CAP cho Admin:`, emergencyNotice);
                    await notifyAdmin(emergencyNotice);
                } else if (isNoiseComplaint) {
                    const noiseNotice = `[PHAN NAN TIENG ON - XU LY NGAY]\nKhach hang ID: ${userId}\nNoi dung phan nan: "${userText}"\nThoi gian: ${new Date().toLocaleString("vi-VN")}\nAdmin/Ban quan ly vui long kiem tra nhac nho khu vuc gay on!`;
                    console.log(`[server] Gửi thông báo PHAN NAN TIENG ON cho Admin:`, noiseNotice);
                    await notifyAdmin(noiseNotice);
                } else if (isRoomNumber || isIssueReport) {
                    const adminNotice = `[YEU CAU HO TRO / BAO HONG]\nKhach hang ID: ${userId}\nNoi dung: "${userText}"\nThoi gian: ${new Date().toLocaleString("vi-VN")}`;
                    console.log(`[server] Gửi thông báo hỗ trợ cho Admin:`, adminNotice);
                    await notifyAdmin(adminNotice);
                }
            }
        }

        // Sự kiện người dùng follow OA
        if (event.event_name === "follow") {
            const userId = event.follower?.id;
            if (userId) {
                await sendTextMessage(userId, "Cảm ơn bạn đã quan tâm OA của mình!");
            }
        }

        // Bạn có thể xử lý thêm các event_name khác ở đây:
        // user_send_image, user_send_sticker, user_click_button, ...
    } catch (err) {
        console.error("[webhook] Lỗi xử lý event:", err);
    }
});

// Kubernetes liveness/readiness probe endpoint
app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

// Legacy health check (kept for backwards compat)
app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

// ----------------------------------------------------------------
// DEV-ONLY: test the reply engine locally without Zalo webhook
// POST http://localhost:3000/test-reply
// Body: { "message": "wifi mật khẩu là gì" }
// ----------------------------------------------------------------
if (process.env.NODE_ENV !== "production") {
    // API endpoint for testing
    app.all("/test-reply", async (req: Request, res: Response) => {
        const userText: string = req.body?.message || (req.query?.q as string);
        if (!userText) {
            res.status(400).json({ error: 'Missing "message" in JSON body or "q" in query string' });
            return;
        }
        console.log(`[test-reply] Testing: "${userText}"`);
        try {
            const reply = await generateReply(userText);
            res.json({ input: userText, reply });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Web Chat UI for testing directly in browser (http://localhost:3000/test)
    app.get("/test", (_req: Request, res: Response) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Zalo OA Chatbot Tester</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #f0f2f5; margin: 0; display: flex; justify-content: center; height: 100vh; padding: 20px; }
        .chat-container { width: 100%; max-width: 600px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; overflow: hidden; }
        .header { background: #0068ff; color: white; padding: 15px 20px; font-weight: bold; font-size: 1.1rem; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 16px; font-size: 0.95rem; white-space: pre-wrap; line-height: 1.4; }
        .msg.user { background: #e3f2fd; color: #0d47a1; align-self: flex-end; border-bottom-right-radius: 4px; }
        .msg.bot { background: #f1f0f0; color: #333; align-self: flex-start; border-bottom-left-radius: 4px; }
        .input-area { padding: 15px; border-top: 1px solid #eee; display: flex; gap: 10px; }
        input { flex: 1; padding: 12px; border: 1px solid #ccc; border-radius: 20px; outline: none; font-size: 1rem; }
        button { background: #0068ff; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        button:hover { background: #0052cc; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">💬 Zalo OA Chatbot Tester (SunHavens)</div>
        <div class="messages" id="messages">
            <div class="msg bot">Xin chào! Bạn gõ câu hỏi thử nghiệm vào ô bên dưới nhé.</div>
        </div>
        <form class="input-area" id="chatForm">
            <input type="text" id="userInput" placeholder="Nhập câu hỏi (ví dụ: phí dịch vụ, địa chỉ, wifi...)" required autocomplete="off" />
            <button type="submit">Gửi</button>
        </form>
    </div>
    <script>
        const form = document.getElementById('chatForm');
        const input = document.getElementById('userInput');
        const messages = document.getElementById('messages');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            addMsg(text, 'user');
            input.value = '';

            try {
                const res = await fetch('/test-reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text })
                });
                const data = await res.json();
                addMsg(data.reply || data.error, 'bot');
            } catch (err) {
                addMsg('Lỗi kết nối server: ' + err.message, 'bot');
            }
        };

        function addMsg(text, sender) {
            const div = document.createElement('div');
            div.className = 'msg ' + sender;
            div.textContent = text;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }
    </script>
</body>
</html>`);
    });

    console.log("[dev] Test endpoint: POST http://localhost:3000/test-reply");
    console.log("[dev] Test UI: OPEN http://localhost:3000/test in your browser!");
}

app.listen(PORT, () => {
    console.log(`Bot server đang chạy tại http://localhost:${PORT}`);
});