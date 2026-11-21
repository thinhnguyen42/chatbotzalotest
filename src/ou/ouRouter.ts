/**
 * OU STUDENT HANDBOOK ROUTER
 * Cung cấp các endpoint REST API và Zalo Webhook độc lập cho Sổ tay Sinh viên Đại học Mở (OU).
 */

import { Router, Request, Response } from "express";
import { handleStudentQuestion } from "./ouService";
import { HANDBOOK_TOPICS, HANDBOOK_ARTICLES } from "./handbookData";
import { sendQuickReplies, sendTextMessage } from "../zaloClient";

export const ouRouter = Router();

/**
 * Health check endpoint cho module OU
 * GET /ou/health hoặc /api/ou/health
 */
ouRouter.get("/health", (_req: Request, res: Response) => {
    res.json({
        status: "ok",
        module: "OU Student Handbook Bot",
        topicsCount: HANDBOOK_TOPICS.length,
        articlesCount: HANDBOOK_ARTICLES.length,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Danh sách chủ đề sổ tay sinh viên
 * GET /ou/topics hoặc /api/ou/topics
 */
ouRouter.get("/topics", (_req: Request, res: Response) => {
    res.json({
        success: true,
        topics: HANDBOOK_TOPICS,
    });
});

/**
 * REST API hỏi đáp sổ tay sinh viên (dành cho Web, Mobile App hoặc kiểm thử)
 * POST /ou/ask hoặc /api/ou/ask
 * Body: { question: string, studentId?: string }
 */
ouRouter.post("/ask", async (req: Request, res: Response) => {
    try {
        const { question, studentId } = req.body;
        if (!question || typeof question !== "string") {
            return res.status(400).json({ success: false, error: "Thiếu trường 'question' trong body JSON." });
        }

        const result = await handleStudentQuestion(question, studentId);
        return res.json(result);
    } catch (err: any) {
        console.error("[ouRouter] Lỗi khi xử lý hỏi đáp sinh viên:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Webhook nhận sự kiện từ Zalo OA Sổ tay Sinh viên (nếu trường cấu hình OA riêng)
 * POST /ou/webhook
 */
ouRouter.post("/webhook", async (req: Request, res: Response) => {
    // Luôn phản hồi 200 OK ngay lập tức cho Zalo để tránh timeout
    res.status(200).json({ error: 0, message: "ok" });

    try {
        const body = req.body;
        const eventName = body.event_name;
        const senderId = body.sender?.id;
        const userText = body.message?.text?.trim() || "";

        if (eventName !== "user_send_text" || !senderId || !userText) {
            return;
        }

        console.log(`[ouRouter] 📩 Tin nhắn từ sinh viên ${senderId}: "${userText}"`);

        const result = await handleStudentQuestion(userText);

        if (result.quickReplies && result.quickReplies.length > 0) {
            await sendQuickReplies(senderId, result.answer, result.quickReplies);
        } else {
            await sendTextMessage(senderId, result.answer);
        }
    } catch (err: any) {
        console.error("[ouRouter] Lỗi xử lý webhook Zalo OU:", err.message);
    }
});

/**
 * Xác thực webhook Zalo (nếu Zalo yêu cầu GET verification)
 */
ouRouter.get("/webhook", (_req: Request, res: Response) => {
    res.status(200).send("OU Student Handbook Webhook Ready.");
});

/**
 * Giao diện Web Chat Tester riêng cho Bot Sổ tay Sinh viên OU
 * GET /ou/test hoặc /api/ou/test
 */
ouRouter.get("/test", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>OU Student Handbook Chatbot Tester</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #f0f4f8; margin: 0; display: flex; justify-content: center; height: 100vh; padding: 20px; }
        .chat-container { width: 100%; max-width: 680px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; overflow: hidden; }
        .header { background: #0b4ea2; color: white; padding: 15px 20px; font-weight: bold; font-size: 1.05rem; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .header input { width: 160px; padding: 6px 10px; border-radius: 6px; border: none; font-size: 0.85rem; }
        .messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 88%; padding: 12px 16px; border-radius: 14px; font-size: 0.94rem; white-space: pre-wrap; line-height: 1.45; }
        .msg.user { background: #e3f2fd; color: #0d47a1; align-self: flex-end; border-bottom-right-radius: 4px; }
        .msg.bot { background: #f3f4f6; color: #222; align-self: flex-start; border-bottom-left-radius: 4px; }
        .btn-container { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 10px 0; align-self: flex-start; }
        .quick-btn { background: #e8f1fc; color: #0b4ea2; border: 1px solid #0b4ea2; padding: 6px 12px; border-radius: 18px; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
        .quick-btn:hover { background: #0b4ea2; color: white; }
        .input-area { padding: 14px; border-top: 1px solid #eee; display: flex; gap: 10px; }
        .input-area input { flex: 1; padding: 11px 14px; border: 1px solid #ccc; border-radius: 20px; outline: none; font-size: 0.96rem; }
        button[type="submit"] { background: #0b4ea2; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
        button[type="submit"]:hover { background: #083a7a; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <span>🎓 Bot Sổ Tay Sinh Viên OU (Test UI)</span>
            <input type="text" id="studentId" placeholder="MSSV (tùy chọn)" value="2451010001" />
        </div>
        <div class="messages" id="messages">
            <div class="msg bot">Xin chào! Hãy nhập câu hỏi theo Sổ tay Sinh viên OU (VD: "thang điểm", "cảnh báo học vụ", "chuẩn đầu ra tiếng anh", "đăng ký ngoại trú", "phòng ctsv") hoặc bấm "xin chào".</div>
        </div>
        <form class="input-area" id="chatForm">
            <input type="text" id="userInput" placeholder="Nhập câu hỏi sinh viên OU..." required autocomplete="off" />
            <button type="submit">Gửi</button>
        </form>
    </div>
    <script>
        const form = document.getElementById('chatForm');
        const input = document.getElementById('userInput');
        const studentInput = document.getElementById('studentId');
        const messages = document.getElementById('messages');
        const askUrl = window.location.pathname.replace(/\\/test\\/?$/, '/ask');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            addMsg(text, 'user');
            input.value = '';
            try {
                const res = await fetch(askUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: text, studentId: studentInput.value.trim() || undefined })
                });
                const data = await res.json();
                addMsg(data.answer || data.error || 'Không có phản hồi', 'bot');
                if (data.quickReplies && data.quickReplies.length > 0) {
                    renderButtons(data.quickReplies);
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
