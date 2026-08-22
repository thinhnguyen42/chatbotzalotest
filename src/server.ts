import "dotenv/config";
import path from "path";
import express, { Request, Response } from "express";
import { sendTextMessage, sendQuickReplies, notifyAdmin, sendImageMessage, sendHouseRulesImage, exchangeCodeAndSaveTokens } from "./zaloClient";
import { generateReply, generateReplyWithButtons } from "./replyEngine";
import { verifyZaloSignature } from "./verifyZaloSignature";
import { checkSpamGuard } from "./spamGuard";
import { isHumanHandoverActive, setHumanHandoverMode, clearHandoverMode, isBotSentMsgId } from "./humanHandover";
import { createTicket, formatUserTicketMessage, formatAdminTicketMessage } from "./ticket/ticketService";

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
        // Sự kiện Admin / Nhân viên gửi tin nhắn trực tiếp cho khách qua Zalo OA Portal
        if (event.event_name === "oa_send_text" || event.event_name === "oa_send_image") {
            const recipientId = event.recipient?.id;
            const msgId = event.message?.msg_id;

            // Nếu đây là event do chính Bot vừa gửi qua API -> Bỏ qua, KHÔNG kích hoạt Human Handover
            if (msgId && isBotSentMsgId(msgId)) {
                console.log(`[server] Nhận event ${event.event_name} từ chính Bot (msg_id: ${msgId}). Bỏ qua Human Handover.`);
                return;
            }

            if (recipientId) {
                console.log(`[server] Admin/Nhân viên đã gửi tin nhắn thủ công cho user ${recipientId}. Tự động chuyển giao Human Handover (Tạm dừng Bot 5p).`);
                setHumanHandoverMode(recipientId);
            }
            return;
        }

        // Sự kiện người dùng gửi tin nhắn văn bản cho OA
        if (event.event_name === "user_send_text") {
            const userId = event.sender?.id;
            const userText = event.message?.text;

            if (userId && userText) {
                // Lệnh Admin điều khiển trực tiếp trạng thái Bot (#pause / #resume)
                if (/^(#pause|\/bot off)$/i.test(userText.trim())) {
                    setHumanHandoverMode(userId);
                    await sendTextMessage(userId, "Dạ em đã tạm dừng Bot cho cuộc trò chuyện này. Admin/Nhân viên sẽ trực tiếp hỗ trợ bạn ạ.");
                    return;
                }
                if (/^(#resume|\/bot on)$/i.test(userText.trim())) {
                    clearHandoverMode(userId);
                    await sendTextMessage(userId, "Dạ em đã bật lại Bot Quản Gia AI tự động hỗ trợ bạn ạ.");
                    return;
                }

                // KIỂM TRA CHẾ ĐỘ NGƯỜI THẬT (HUMAN HANDOVER): nếu đang có Admin hỗ trợ -> Bot IM LẶNG
                if (isHumanHandoverActive(userId)) {
                    console.log(`[server] User ${userId} đang trong cuộc trò chuyện với Admin. Bot giữ im lặng.`);
                    return;
                }

                // Kiểm tra spam lặp lại & junk text: bỏ qua nếu vi phạm
                if (checkSpamGuard(userId, userText) === "ignore") {
                    return;
                }

                const { replyText, recommendedButtons, extractedIntent, createdTicket } = await generateReplyWithButtons(userText, userId);
                await sendQuickReplies(userId, replyText, recommendedButtons);

                // Nếu khách hỏi về Nội quy -> Tự động upload & gửi kèm hình ảnh noiQuy.jpg
                const isHouseRules = /\b(nội quy|quy định)\b/i.test(userText);
                if (isHouseRules) {
                    console.log(`[server] Gửi hình ảnh Bảng nội quy noiQuy.jpg đính kèm cho user ${userId}...`);
                    await sendHouseRulesImage(userId);
                }

                // Gửi thông báo ngầm cho Admin nếu có Ticket vừa được tạo thành công
                if (createdTicket) {
                    const adminTicketMsg = formatAdminTicketMessage(createdTicket);
                    console.log(`[server] Gửi TICKET #${createdTicket.ticketCode} ngầm cho Admin:`, adminTicketMsg);
                    await notifyAdmin(adminTicketMsg);
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

        const testUserId = (req.headers["x-test-user-id"] as string) || req.ip || "test-user";

        // Lệnh Admin thử nghiệm (#pause / #resume)
        if (/^(#pause|\/bot off)$/i.test(userText.trim())) {
            setHumanHandoverMode(testUserId);
            res.json({ input: userText, reply: "Dạ em đã tạm dừng Bot cho cuộc trò chuyện này. Admin/Nhân viên sẽ trực tiếp hỗ trợ bạn ạ." });
            return;
        }
        if (/^(#resume|\/bot on)$/i.test(userText.trim())) {
            clearHandoverMode(testUserId);
            res.json({ input: userText, reply: "Dạ em đã bật lại Bot Quản Gia AI tự động hỗ trợ bạn ạ." });
            return;
        }

        // KIỂM TRA CHẾ ĐỘ NGƯỜI THẬT (HUMAN HANDOVER): nếu đang có Admin hỗ trợ -> Bot IM LẶNG
        if (isHumanHandoverActive(testUserId)) {
            console.log(`[test-reply] User ${testUserId} đang trong cuộc trò chuyện với Admin. Bot giữ im lặng.`);
            res.json({ input: userText, reply: null, isIgnored: true });
            return;
        }

        // Test Anti-Spam check (3 cùng nội dung trong 30 giây): im lặng hoàn toàn, không phản hồi
        if (checkSpamGuard(testUserId, userText) === "ignore") {
            console.log(`[test-reply] Im lặng bỏ qua tin nhắn spam từ user ${testUserId}: "${userText}"`);
            res.json({
                input: userText,
                reply: null,
                isIgnored: true
            });
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
        <div class="header">Zalo OA Chatbot Tester (SunHavens)</div>
        <div class="messages" id="messages">
            <div class="msg bot">Xin chào! Bạn gõ câu hỏi thử nghiệm vào ô bên dưới nhé (thử cả tiếng Việt có dấu hoặc không dấu).</div>
        </div>
        <form class="input-area" id="chatForm">
            <input type="text" id="userInput" placeholder="Nhập câu hỏi (ví dụ: wifi mat khau, noi quy, dia chi...)" required autocomplete="off" />
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
                if (data.isIgnored || !data.reply) {
                    console.log('[test] Tin nhắn bị bỏ qua do spam (im lặng trong 30s)');
                    return;
                }
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

// Endpoint hỗ trợ OAuth Authorize trực tiếp trên Production Webserver
app.get("/oa/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    if (!code) {
        res.status(400).send("Thiếu tham số ?code= từ Zalo redirect.");
        return;
    }

    const result = await exchangeCodeAndSaveTokens(code);
    if (result.success) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9f9f9; height: 100vh;">
                <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: #2e7d32; font-size: 24px;">Cấp Quyền Zalo OA Thành Công!</h1>
                    <p style="color: #555; font-size: 16px; line-height: 1.5;">Bot Quản Gia AI trên Server Production đã nhận và lưu Access Token & Refresh Token mới.</p>
                    <p style="color: #0068ff; font-weight: bold;">Bây giờ Bot có thể tự động trả lời tin nhắn Zalo 24/7 rồi nha!</p>
                </div>
            </div>
        `);
    } else {
        res.status(400).send(`Đổi token thất bại. Mã code đã hết hạn hoặc không hợp lệ: ${result.error}`);
    }
});

app.listen(PORT, () => {
    console.log(`Bot server đang chạy tại http://localhost:${PORT}`);
});