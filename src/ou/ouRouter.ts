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
