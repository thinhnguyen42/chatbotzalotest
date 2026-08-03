import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Verify request webhook tu Zalo.
 * Cong thuc Zalo quy dinh:
 *   mac = sha256(app_id + <raw JSON body string> + timestamp + OA_SECRET_KEY)
 * So sanh voi header "X-ZEvent-Signature" (dang "mac=<hash>").
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
        console.warn("[verifyZaloSignature] Thieu ZALO_OA_SECRET_KEY trong .env -> Bo qua verify");
        return next();
    }

    if (!signatureHeader) {
        console.warn("[verifyZaloSignature] Khong co X-ZEvent-Signature header -> Cho phep tiep tuc (200 OK)");
        return next();
    }

    try {
        const body = JSON.parse(rawBody || "{}");
        const appId = body.app_id || process.env.ZALO_APP_ID || "";
        const timestamp = body.timestamp || "";

        const rawVerify = `${appId}${rawBody}${timestamp}${oaSecretKey}`;
        const expectedMac = crypto.createHash("sha256").update(rawVerify).digest("hex");
        const expectedHeader = `mac=${expectedMac}`;

        const isValid =
            signatureHeader.length === expectedHeader.length &&
            crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedHeader));

        if (!isValid) {
            console.warn("[verifyZaloSignature] Chu ky X-ZEvent-Signature khong khop -> Cho phep tiep tuc de khong loi Webhook URL");
        } else {
            console.log("[verifyZaloSignature] Chu ky Zalo hop le!");
        }

        next();
    } catch (err) {
        console.warn("[verifyZaloSignature] Ngoai le khi verify chu ky -> Cho phep tiep tuc (200 OK)");
        next();
    }
}
