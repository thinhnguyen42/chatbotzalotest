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

    if (!oaSecretKey) {
        console.warn("[verifyZaloSignature] Thiếu ZALO_OA_SECRET_KEY trong .env - bỏ qua verify (KHÔNG an toàn cho production)");
        return next();
    }

    try {
        const body = JSON.parse(rawBody);
        const appId = body.app_id;
        const timestamp = body.timestamp;

        const rawVerify = `${appId}${rawBody}${timestamp}${oaSecretKey}`;
        const expectedMac = crypto.createHash("sha256").update(rawVerify).digest("hex");
        const expectedHeader = `mac=${expectedMac}`;

        // So sánh an toàn, tránh timing attack
        const isValid =
            signatureHeader.length === expectedHeader.length &&
            crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedHeader));

        if (!isValid) {
            console.warn("[verifyZaloSignature] Chữ ký không khớp - từ chối request");
            res.sendStatus(401);
            return;
        }

        next();
    } catch (err) {
        console.error("[verifyZaloSignature] Lỗi khi verify:", err);
        res.sendStatus(400);
    }
}
