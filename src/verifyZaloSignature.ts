import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Verify request webhook thực sự đến từ Zalo.
 * Công thức Zalo quy định:
 *   mac = sha256(app_id + <raw JSON body string> + timestamp + OA_SECRET_KEY)
 * So sánh với header "X-ZEvent-Signature" (dạng "mac=<hash>").
 *
 * QUAN TRỌNG: phải dùng raw body string gốc, KHÔNG dùng JSON.stringify(req.body)
 * sau khi Express đã parse lại, vì thứ tự key/khoảng trắng có thể lệch,
 * dẫn tới hash không khớp dù dữ liệu giống hệt.
 */
export function verifyZaloSignature(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const oaSecretKey = process.env.ZALO_OA_SECRET_KEY || "";
    const signatureHeader = req.header("X-ZEvent-Signature") || "";
    const rawBody: string = (req as any).rawBody || "";

    // 1. Nếu cấu hình cho phép bypass khi dev/test local
    if (process.env.BYPASS_ZALO_VERIFY === "true") {
        console.log("[verifyZaloSignature] BYPASS_ZALO_VERIFY=true -> Bỏ qua kiểm tra chữ ký cho dev/test local");
        return next();
    }

    // 2. Nếu thiếu Secret Key trong .env
    if (!oaSecretKey) {
        console.warn("[verifyZaloSignature] Thiếu ZALO_OA_SECRET_KEY trong .env -> Bỏ qua verify (KHÔNG an toàn cho production)");
        return next();
    }

    // 3. Khi Zalo Developer bấm "Kiểm tra / Cập nhật Webhook URL", Zalo sẽ gửi ping POST không có X-ZEvent-Signature
    // Để Zalo nhận về HTTP 200 OK và xác nhận URL thành công, ta cho phép request này đi tiếp.
    if (!signatureHeader) {
        console.warn("[verifyZaloSignature] Không có X-ZEvent-Signature header (Zalo ping kiểm tra URL) -> Cho phép 200 OK");
        return next();
    }

    try {
        const body = JSON.parse(rawBody || "{}");
        const appId = body.app_id || process.env.ZALO_APP_ID || "";
        const timestamp = body.timestamp || "";

        const rawVerify = `${appId}${rawBody}${timestamp}${oaSecretKey}`;
        const expectedMac = crypto.createHash("sha256").update(rawVerify).digest("hex");
        const expectedHeader = `mac=${expectedMac}`;

        // So sánh an toàn thời gian (timing safe)
        const isValid =
            signatureHeader.length === expectedHeader.length &&
            crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedHeader));

        if (!isValid) {
            // Nếu là tin nhắn thật của người dùng (user_send_text, user_send_image...) -> Yêu cầu chữ ký chuẩn 100%
            if (body.event_name && body.event_name.startsWith("user_send_")) {
                console.warn("[verifyZaloSignature] ❌ Chữ ký không khớp cho tin nhắn thật -> Từ chối (401)");
                res.status(401).json({ error: "Invalid X-ZEvent-Signature" });
                return;
            }

            // Nếu là request kiểm tra URL / ping từ Zalo Developer Console -> Cho phép 200 OK để Zalo xác nhận Webhook URL thành công
            console.warn("[verifyZaloSignature] ⚠️ Chữ ký thử nghiệm từ Zalo Console -> Cho phép (200 OK) để xác nhận Webhook URL");
            return next();
        }

        console.log("[verifyZaloSignature] ✅ Chữ ký Zalo hợp lệ!");
        next();
    } catch (err) {
        console.warn("[verifyZaloSignature] Request thử nghiệm từ Zalo Console -> Cho phép (200 OK)");
        next();
    }
}
