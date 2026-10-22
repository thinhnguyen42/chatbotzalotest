import "dotenv/config";
import path from "path";
import fs from "fs";
import express, { Request, Response } from "express";
import { sendTextMessage, sendQuickReplies, notifyAdmin, sendImageMessage, sendHouseRulesImage, exchangeCodeAndSaveTokens } from "./zaloClient";
import { generateReply, generateReplyWithButtons } from "./replyEngine";
import { verifyZaloSignature } from "./verifyZaloSignature";
import { checkSpamGuard } from "./spamGuard";
import { isHumanHandoverActive, setHumanHandoverMode, clearHandoverMode, isBotSentMsgId } from "./humanHandover";
import { createTicket, formatUserTicketMessage, formatAdminTicketMessage } from "./ticket/ticketService";
import { startLinkApprovalPoller, pollApprovedLinkRequests } from "./jobs/linkApprovalPoller";
import { startIncidentNotifyPoller, pollNewIncidents } from "./jobs/incidentNotifyPoller";
import { getSession } from "./memory/sessionMemory";
import { LARK_INCIDENT_FORM_URL, invalidateTenantCache } from "./lark/larkClient";
import { startTTLockServiceIfNeeded } from "./ttlock/ttlockServiceManager";
import { prewarmTTLock } from "./ttlock/ttlockClient";

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

// Route xác thực quyền sở hữu tên miền cho Zalo Developer (HTML file & Meta tags)
app.get("/zalo_verifierMDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r.html", (_req, res) => {
    const filePath = path.join(__dirname, "..", "public", "zalo_verifierMDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r.html");
    if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.sendFile(filePath);
    } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`<!DOCTYPE html>
<html lang="en">

<head>
    <meta property="zalo-platform-site-verification" content="MDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r" />
    <meta name="zalo-platform-site-verification" content="MDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r" />
</head>

<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>

</html>`);
    }
});

app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="MDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r" />
    <meta name="zalo-platform-site-verification" content="MDYa0wpLTYTR_j5-cFnTVcQEYrkA-546CJ4r" />
    <title>Zalo OA Bot</title>
</head>
<body>
<h1>Zalo OA Bot Active</h1>
</body>
</html>`);
});

const PORT = process.env.PORT || 3002;

// Phục vụ Zalo Developer Console kiểm tra Webhook (GET / HEAD)
app.get("/webhook", (req: Request, res: Response) => {
    console.log("[webhook] Nhận GET kiểm tra webhook từ Zalo:", req.query);
    const challenge = req.query["hub.challenge"] || req.query.challenge;
    if (challenge) {
        return res.status(200).send(challenge);
    }
    return res.status(200).send("OK");
});

app.head("/webhook", (_req: Request, res: Response) => {
    res.status(200).end();
});

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

        // Sự kiện người dùng gửi tin nhắn văn bản hoặc bấm nút tương tác
        if (event.event_name === "user_send_text" || event.event_name === "user_click_button" || event.event_name === "user_click_oa_menu") {
            const userId = event.sender?.id || event.user_id_by_app;
            const userText = event.message?.text || event.message?.payload || event.payload;

            if (userId && userText) {
                // Bỏ qua gói tin test giả lập từ Zalo Developer Portal Webhook Tester (tránh lỗi user_id is invalid)
                if (event.message?.msg_id === "This is message id" || userText === "This is testing message" || userId === "6053690184268964198") {
                    console.log("[webhook] Nhận gói tin Webhook Test giả lập từ Zalo Developer Portal. Bỏ qua phản hồi để tránh lỗi user_id is invalid.");
                    return;
                }

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

                const { replyText, recommendedButtons, extractedIntent, createdTicket, adminNotificationMsg } = await generateReplyWithButtons(userText, userId);
                await sendQuickReplies(userId, replyText, recommendedButtons);

                // Nếu khách hỏi về Nội quy -> Tự động upload & gửi kèm hình ảnh noiQuy.jpg
                const isHouseRules = /\b(nội quy|quy định)\b/i.test(userText);
                if (isHouseRules) {
                    console.log(`[server] Gửi hình ảnh Bảng nội quy noiQuy.jpg đính kèm cho user ${userId}...`);
                    await sendHouseRulesImage(userId);
                }

                // Gửi thông báo ngầm cho Admin nếu có yêu cầu trực tiếp hoặc Ticket vừa tạo
                if (adminNotificationMsg) {
                    console.log(`[server] Gửi thông báo ngầm cho Admin về yêu cầu của user ${userId}`);
                    notifyAdmin(adminNotificationMsg).catch((err) => console.error("[server] Lỗi gửi admin notification:", err.message));
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

        // Sự kiện gán nhãn người dùng / tạo nhãn qua Open API (add_user_to_tag)
        if (event.event_name === "add_user_to_tag") {
            const tagName = event.tag?.name;
            const taggedUsers = event.tag?.user_ids;
            if (taggedUsers && taggedUsers.length > 0) {
                console.log(`[webhook] Xác nhận từ Zalo OA: Đã gán nhãn "${tagName}" cho user(s): ${taggedUsers.join(", ")}`);
            } else {
                console.log(`[webhook] Xác nhận từ Zalo OA: Đã tạo nhãn mới "${tagName}" trên OA.`);
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
            const { replyText, recommendedButtons } = await generateReplyWithButtons(userText, testUserId);
            res.json({ input: userText, reply: replyText, buttons: recommendedButtons });
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
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 16px; font-size: 0.95rem; white-space: pre-wrap; line-height: 1.4; }
        .msg.user { background: #e3f2fd; color: #0d47a1; align-self: flex-end; border-bottom-right-radius: 4px; }
        .msg.bot { background: #f1f0f0; color: #333; align-self: flex-start; border-bottom-left-radius: 4px; }
        .btn-container { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 10px 0; align-self: flex-start; }
        .quick-btn { background: #e7f3ff; color: #0068ff; border: 1px solid #0068ff; padding: 7px 14px; border-radius: 18px; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .quick-btn:hover { background: #0068ff; color: white; transform: translateY(-1px); }
        .input-area { padding: 15px; border-top: 1px solid #eee; display: flex; gap: 10px; }
        input { flex: 1; padding: 12px; border: 1px solid #ccc; border-radius: 20px; outline: none; font-size: 1rem; }
        button[type="submit"] { background: #0068ff; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        button[type="submit"]:hover { background: #0052cc; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">Zalo OA Chatbot Tester (SunHavens)</div>
        <div class="messages" id="messages">
            <div class="msg bot">Xin chào! Bạn có thể thử nghiệm nhắn "passcode" hoặc các câu hỏi khác để xem các nút bấm tương tác nhé.</div>
        </div>
        <form class="input-area" id="chatForm">
            <input type="text" id="userInput" placeholder="Nhập câu hỏi (ví dụ: passcode, wifi, nội quy...)" required autocomplete="off" />
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
                if (data.buttons && data.buttons.length > 0) {
                    renderButtons(data.buttons);
                }
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

        function renderButtons(buttons) {
            const container = document.createElement('div');
            container.className = 'btn-container';
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'quick-btn';
                btn.textContent = b.title;
                btn.onclick = () => {
                    input.value = b.payload || b.title;
                    form.requestSubmit();
                };
                container.appendChild(btn);
            });
            messages.appendChild(container);
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

// Webhook trigger từ Lark Base Automation (khi Admin bấm duyệt hoặc cư dân gửi báo sự cố mới)
// URL: POST /webhook/lark-trigger hoặc GET /webhook/lark-sync
app.all(["/webhook/lark-trigger", "/webhook/lark-sync"], async (_req: Request, res: Response) => {
    res.json({ status: "ok", message: "Lark sync triggered successfully" });
    try {
        console.log("[webhook] 🔔 Nhận tín hiệu trigger từ Lark Base! Đang đồng bộ tức thì...");
        invalidateTenantCache();
        const [linksProcessed, incidentsNotified] = await Promise.all([
            pollApprovedLinkRequests(),
            pollNewIncidents(),
        ]);
        console.log(`[webhook] ✅ Đồng bộ tức thì Lark Base xong: ${linksProcessed} liên kết, ${incidentsNotified} sự cố.`);
    } catch (err: any) {
        console.error("[webhook] ❌ Lỗi khi đồng bộ qua Lark trigger webhook:", err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Bot server đang chạy tại http://localhost:${PORT}`);
    // Khởi động polling duyệt hồ sơ cư dân Lark Base (Task 3B)
    if (process.env.ENABLE_LARK_SYNC === "true") {
        startLinkApprovalPoller();
        startIncidentNotifyPoller();
        console.log("[server] 🔄 Đã kích hoạt Poller đồng bộ Lark Base.");
    } else {
        console.log("[server] 📁 Chạy chế độ Offline / CSV (Lark Base Sync đang tắt để tiết kiệm API). Đặt ENABLE_LARK_SYNC=true trong .env nếu muốn bật lại.");
    }


    // Tự động kiểm tra và khởi chạy dịch vụ TTLock FastAPI (cổng 8001) nếu chưa chạy
    startTTLockServiceIfNeeded().catch((err) => {
        console.warn("[server] Không thể khởi chạy TTLock service tự động:", err.message);
    });
    // Làm nóng trước (Pre-warm) kết nối Cloud TTLock để sẵn sàng cấp pass trong 300ms
    prewarmTTLock().catch((err) => {
        console.warn("[server] Không thể pre-warm TTLock:", err.message);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHORT URL: /bao-su-co — Redirect đến Lark Base Form với thông tin pre-fill
// Khách Zalo click link này → server tra cứu phòng/tòa từ session → redirect
// ─────────────────────────────────────────────────────────────────────────────
app.get(["/bao-su-co", "/sc"], (req: Request, res: Response) => {
    const uid = req.query.uid as string;

    let formUrl = LARK_INCIDENT_FORM_URL;

    if (uid) {
        try {
            // Lấy thông tin phòng/tòa từ session memory nếu có
            const session = getSession(uid) as any;
            const formParams = new URLSearchParams();

            const roomNumber = session?.roomNumber && session.roomNumber !== "Chưa xác định" && session.roomNumber !== "000"
                ? session.roomNumber
                : "";
            const toaNha = session?.tagCode
                ? String(session.tagCode).split("-")[0]  // "38PBV-401" → "38PBV"
                : "38PBV";

            if (roomNumber) formParams.set("prefill_SoPhong", roomNumber);
            if (toaNha) formParams.set("prefill_ToaNha", toaNha);
            formParams.set("prefill_ZaloUserID", uid);

            const queryString = formParams.toString();
            formUrl = queryString
                ? `${LARK_INCIDENT_FORM_URL}?${queryString}`
                : LARK_INCIDENT_FORM_URL;

            console.log(`[/bao-su-co] Redirect user ${uid} (phòng: ${roomNumber || "chưa rõ"}) đến form: ${formUrl}`);
        } catch (err) {
            console.error("[/bao-su-co] Lỗi khi tạo pre-fill URL:", err);
        }
    }

    res.redirect(302, formUrl);
});