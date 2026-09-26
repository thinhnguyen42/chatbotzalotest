import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import { markMsgIdAsBotSent } from "./humanHandover";

// Kích hoạt HTTP/HTTPS Keep-Alive tái sử dụng kết nối socket, tiết kiệm 150-300ms TLS handshake mỗi tin nhắn
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 30 });

/**
 * Module này lo 2 việc:
 * 1. Giữ access token, tự refresh khi hết hạn
 * 2. Cung cấp hàm sendTextMessage để bắn tin nhắn trả lời về cho user
 *
 * QUAN TRỌNG: Zalo XOAY VÒNG refresh_token - mỗi lần refresh thành công,
 * Zalo trả về 1 refresh_token MỚI và vô hiệu hóa refresh_token cũ ngay lập tức.
 * Vì vậy token phải được lưu ra FILE (không chỉ RAM), để không bị mất khi
 * server restart (vd: nodemon tự restart khi bạn sửa code) - nếu không,
 * lần sau server khởi động lại sẽ đọc refresh_token CŨ từ .env -> lỗi
 * "Invalid refresh token".
 *
 * LƯU Ý: access token/refresh token BAN ĐẦU bạn phải lấy thủ công 1 lần
 * qua bước OAuth authorize hoặc API Explorer (xem README), điền vào .env.
 * Sau lần chạy đầu tiên, mọi lần refresh tiếp theo sẽ tự lưu vào file
 * data/zalo-tokens.json và ưu tiên đọc từ đó thay vì .env.
 */

interface TokenState {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // epoch ms
}

const TOKEN_FILE = path.join(__dirname, "..", "data", "zalo-tokens.json");

function loadTokenState(): TokenState {
    // Ưu tiên đọc từ file (đã được refresh gần nhất), nếu chưa có thì lấy từ .env
    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
            console.log("[zaloClient] Đã load token đã lưu từ data/zalo-tokens.json");
            return saved;
        } catch {
            // file hỏng -> rơi xuống đọc từ .env
        }
    }

    console.log("[zaloClient] Chưa có token đã lưu, dùng token khởi tạo từ .env");
    return {
        accessToken: process.env.ZALO_ACCESS_TOKEN || "",
        refreshToken: process.env.ZALO_REFRESH_TOKEN || "",
        // Mặc định coi access token từ .env còn sống 24h để dùng ngay, tránh bị ép refresh ngay ở tin nhắn đầu
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
}

function saveTokenState(state: TokenState): void {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(state, null, 2), "utf8");
}

let tokenState: TokenState = loadTokenState();

const APP_ID = process.env.ZALO_APP_ID || "";
const APP_SECRET = process.env.ZALO_APP_SECRET || "";

export async function exchangeCodeAndSaveTokens(code: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const appId = process.env.ZALO_APP_ID || APP_ID;
    const secretsToTry = [
        process.env.ZALO_APP_SECRET,
        process.env.ZALO_OA_SECRET_KEY,
        APP_SECRET
    ].filter(Boolean) as string[];

    if (!appId || secretsToTry.length === 0) {
        return { success: false, error: "Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trong file .env" };
    }

    let lastErrorData: any = null;

    for (const secret of secretsToTry) {
        try {
            const res = await axios.post(
                "https://oauth.zaloapp.com/v4/oa/access_token",
                new URLSearchParams({
                    app_id: appId,
                    code: code,
                    grant_type: "authorization_code",
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        secret_key: secret,
                    },
                }
            );

            if (res.data?.access_token && res.data?.refresh_token) {
                tokenState = {
                    accessToken: res.data.access_token,
                    refreshToken: res.data.refresh_token,
                    expiresAt: Date.now() + 25 * 60 * 60 * 1000 - 5 * 60 * 1000,
                };
                saveTokenState(tokenState);

                // Cập nhật cả .env nếu có
                const envPath = path.join(__dirname, "..", ".env");
                if (fs.existsSync(envPath)) {
                    try {
                        let envContent = fs.readFileSync(envPath, "utf8");
                        envContent = envContent.replace(/^ZALO_ACCESS_TOKEN=.*/m, `ZALO_ACCESS_TOKEN=${res.data.access_token}`);
                        envContent = envContent.replace(/^ZALO_REFRESH_TOKEN=.*/m, `ZALO_REFRESH_TOKEN=${res.data.refresh_token}`);
                        fs.writeFileSync(envPath, envContent, "utf8");
                    } catch {}
                }

                console.log("[zaloClient] Lấy & lưu OAuth token mới thành công!");
                return { success: true, data: res.data };
            } else {
                lastErrorData = res.data;
            }
        } catch (err: any) {
            console.error("[zaloClient] Lỗi khi đổi code:", err.message);
            lastErrorData = err.response?.data || err.message;
        }
    }

    return { success: false, error: JSON.stringify(lastErrorData) };
}

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            // Kiểm tra xem file token đã được tiến trình khác cập nhật gần đây chưa
            if (fs.existsSync(TOKEN_FILE)) {
                try {
                    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
                    if (saved.expiresAt > Date.now() + 60000 && saved.accessToken !== tokenState.accessToken) {
                        tokenState = saved;
                        console.log("[zaloClient] Sử dụng token vừa được cập nhật từ data/zalo-tokens.json");
                        return;
                    }
                } catch {}
            }

            const res = await axios.post(
                "https://oauth.zaloapp.com/v4/oa/access_token",
                new URLSearchParams({
                    app_id: APP_ID,
                    grant_type: "refresh_token",
                    refresh_token: tokenState.refreshToken,
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        secret_key: APP_SECRET,
                    },
                }
            );

            const data = res.data;
            if (!data.access_token) {
                console.error("[zaloClient] Không refresh được token Zalo:", data);
                throw new Error("Không refresh được token: " + JSON.stringify(data));
            }

            tokenState = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || tokenState.refreshToken,
                expiresAt: Date.now() + 25 * 60 * 60 * 1000 - 5 * 60 * 1000,
            };

            saveTokenState(tokenState);

            // Đồng bộ luôn sang file .env
            const envPath = path.join(__dirname, "..", ".env");
            if (fs.existsSync(envPath)) {
                try {
                    let envContent = fs.readFileSync(envPath, "utf8");
                    envContent = envContent.replace(/^ZALO_ACCESS_TOKEN=.*/m, `ZALO_ACCESS_TOKEN=${tokenState.accessToken}`);
                    envContent = envContent.replace(/^ZALO_REFRESH_TOKEN=.*/m, `ZALO_REFRESH_TOKEN=${tokenState.refreshToken}`);
                    fs.writeFileSync(envPath, envContent, "utf8");
                } catch {}
            }

            console.log("[zaloClient] Đã refresh access token mới thành công!");
        } catch (err: any) {
            console.error("[zaloClient] Lỗi khi refresh access token:", err.response?.data || err.message);
            throw err;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

async function ensureValidToken(): Promise<string> {
    if (!tokenState.accessToken || Date.now() >= tokenState.expiresAt) {
        await refreshAccessToken();
    }
    return tokenState.accessToken;
}

export async function sendTextMessage(userId: string, text: string): Promise<void> {
    let token = await ensureValidToken();
    const payload = {
        recipient: { user_id: userId },
        message: { text },
    };

    try {
        let res = await axios.post(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    access_token: token,
                },
            }
        );

        // Zalo API trả về HTTP 200 OK kể cả khi có lỗi! Cần kiểm tra res.data.error:
        if (res.data && res.data.error !== 0) {
            console.warn(`[zaloClient] Zalo API trả về lỗi (code ${res.data.error}): ${res.data.message}`, res.data);

            // Nếu lỗi liên quan đến token (code -216 hoặc message chứa token) -> thử refresh token và gửi lại 1 lần
            if (res.data.error === -216 || (typeof res.data.message === "string" && res.data.message.toLowerCase().includes("token"))) {
                try {
                    console.log("[zaloClient] Thử refresh token và gửi lại...");
                    await refreshAccessToken();
                    token = tokenState.accessToken;
                    res = await axios.post(
                        "https://openapi.zalo.me/v3.0/oa/message/cs",
                        payload,
                        {
                            headers: {
                                "Content-Type": "application/json",
                                access_token: token,
                            },
                        }
                    );
                } catch (refreshErr: any) {
                    console.error("[zaloClient] Lỗi khi thử lại sau refresh token:", refreshErr.message);
                }
            }
        }

        if (res.data && res.data.error === 0) {
            const msgId = res.data.data?.message_id;
            if (msgId) markMsgIdAsBotSent(msgId);
            console.log(`[zaloClient] Đã gửi tin nhắn thành công tới user: ${userId} (msg_id: ${msgId || 'ok'})`);
        } else {
            console.error(`[zaloClient] THẤT BẠI khi gửi tin nhắn tới user ${userId}! Chi tiết từ Zalo API:`, JSON.stringify(res.data));
        }
    } catch (err: any) {
        const errData = err.response?.data;
        console.error("[zaloClient] Gửi tin thất bại (HTTP Error):", errData || err.message);
        throw err;
    }
}

export async function sendQuickReplies(
    userId: string,
    text: string,
    buttons: Array<{ title: string; payload: string }>
): Promise<void> {
    if (!buttons || buttons.length === 0) {
        return sendTextMessage(userId, text);
    }

    let token = await ensureValidToken();
    const formattedButtons = buttons.slice(0, 5).map((b) => ({
        title: b.title.length > 100 ? b.title.substring(0, 100) : b.title,
        type: "oa.query.show",
        payload: b.payload || b.title,
    }));

    const payload = {
        recipient: { user_id: userId },
        message: {
            text: text,
            attachment: {
                type: "template",
                payload: {
                    buttons: formattedButtons,
                },
            },
        },
    };

    try {
        let res = await axios.post(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    access_token: token,
                },
            }
        );

        if (res.data && res.data.error === 0) {
            const msgId = res.data.data?.message_id;
            if (msgId) markMsgIdAsBotSent(msgId);
            console.log(`[zaloClient] Đã gửi Interactive Buttons thành công tới user: ${userId}`);
        } else {
            console.warn(`[zaloClient] Buttons API trả về code ${res.data?.error}: ${res.data?.message}. Chuyển sang fallback text.`);
            const buttonTextList = buttons.map((b) => `👉 [${b.title}]`).join("\n");
            const fallbackText = `${text}\n\nGợi ý thao tác nhanh:\n${buttonTextList}`;
            await sendTextMessage(userId, fallbackText);
        }
    } catch (err: any) {
        console.warn("[zaloClient] Lỗi gửi Interactive Buttons, dùng fallback sendTextMessage:", err.message);
        await sendTextMessage(userId, text);
    }
}

export async function notifyAdmin(text: string): Promise<void> {
    const adminUserId = process.env.ZALO_ADMIN_USER_ID;
    if (!adminUserId) {
        console.log("[zaloClient] Bỏ qua gửi admin (Chưa cấu hình ZALO_ADMIN_USER_ID trong .env)");
        return;
    }

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            await sendTextMessage(adminUserId, text);
            console.log(`[zaloClient] Đã gửi thông báo cho Admin (${adminUserId}) thành công!`);
            return;
        } catch (err: any) {
            attempts++;
            console.warn(`[zaloClient] Thử lại gửi thông báo cho Admin (Lần ${attempts}/${maxAttempts}): ${err.message}`);
            if (attempts >= maxAttempts) {
                console.error("[zaloClient] Thất bại khi gửi thông báo cho Admin sau 3 lần:", err.message);
            } else {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }
}

export async function sendImageMessage(userId: string, imageUrl: string): Promise<void> {
    if (!imageUrl) return;
    let token = await ensureValidToken();
    const payload = {
        recipient: { user_id: userId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "media",
                    elements: [
                        {
                            media_type: "image",
                            url: imageUrl,
                        },
                    ],
                },
            },
        },
    };

    try {
        let res = await axios.post(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    access_token: token,
                },
            }
        );

        if (res.data && res.data.error !== 0) {
            console.warn(`[zaloClient] Zalo API gửi ảnh trả về lỗi (code ${res.data.error}): ${res.data.message}`, res.data);
            if (res.data.error === -216 || (typeof res.data.message === "string" && res.data.message.toLowerCase().includes("token"))) {
                console.log("[zaloClient] Thử refresh token và gửi lại ảnh...");
                await refreshAccessToken();
                token = tokenState.accessToken;
                res = await axios.post(
                    "https://openapi.zalo.me/v3.0/oa/message/cs",
                    payload,
                    {
                        headers: {
                            "Content-Type": "application/json",
                            access_token: token,
                        },
                    }
                );
            }
        }

        if (res.data && res.data.error === 0) {
            const msgId = res.data.data?.message_id;
            if (msgId) markMsgIdAsBotSent(msgId);
            console.log(`[zaloClient] Đã gửi ảnh thành công tới user: ${userId}`);
        } else {
            console.error(`[zaloClient] THẤT BẠI khi gửi ảnh tới user ${userId}:`, JSON.stringify(res.data));
        }
    } catch (err: any) {
        console.error("[zaloClient] Gửi ảnh thất bại:", err.response?.data || err.message);
    }
}

let cachedNoiQuyAttachmentId: string | null = null;

export async function uploadLocalImageToZalo(filePath: string): Promise<string | null> {
    if (!fs.existsSync(filePath)) {
        console.error("[zaloClient] File ảnh không tồn tại:", filePath);
        return null;
    }

    try {
        const token = await ensureValidToken();

        const res = await axios.postForm(
            "https://openapi.zalo.me/v2.0/oa/upload/image",
            {
                file: fs.createReadStream(filePath),
            },
            {
                headers: {
                    access_token: token,
                },
            }
        );

        if (res.data?.error === 0 && res.data?.data?.attachment_id) {
            console.log("[zaloClient] Upload ảnh noiQuy.jpg lên Zalo thành công! attachment_id:", res.data.data.attachment_id);
            return res.data.data.attachment_id;
        } else {
            console.warn("[zaloClient] Kết quả upload ảnh Zalo:", res.data);
            return res.data?.data?.attachment_id || null;
        }
    } catch (err: any) {
        console.error("[zaloClient] Lỗi upload ảnh Zalo:", err.response?.data || err.message);
        return null;
    }
}

export async function sendHouseRulesImage(userId: string): Promise<void> {
    const targetPath = path.join(__dirname, "..", "public", "noiQuy.jpg");

    if (!fs.existsSync(targetPath)) {
        console.warn("[zaloClient] Không tìm thấy file noiQuy.jpg tại:", targetPath);
        return;
    }

    // 1. Thử upload trực tiếp file ảnh local lên Zalo OA CDN lấy attachment_id
    if (!cachedNoiQuyAttachmentId) {
        cachedNoiQuyAttachmentId = await uploadLocalImageToZalo(targetPath);
    }

    if (cachedNoiQuyAttachmentId) {
        let token = await ensureValidToken();
        const payload = {
            recipient: { user_id: userId },
            message: {
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "media",
                        elements: [
                            {
                                media_type: "image",
                                attachment_id: cachedNoiQuyAttachmentId,
                            },
                        ],
                    },
                },
            },
        };
        try {
            let res = await axios.post(
                "https://openapi.zalo.me/v3.0/oa/message/cs",
                payload,
                {
                    headers: {
                        "Content-Type": "application/json",
                        access_token: token,
                    },
                }
            );
            if (res.data && res.data.error === 0) {
                const msgId = res.data.data?.message_id;
                if (msgId) markMsgIdAsBotSent(msgId);
                console.log(`[zaloClient] Đã gửi ảnh noiQuy.jpg thành công tới user: ${userId}`);
                return;
            } else {
                console.warn(`[zaloClient] Gửi ảnh theo attachment_id trả về lỗi (code ${res.data?.error}):`, res.data);
            }
        } catch (err: any) {
            console.error("[zaloClient] Gửi ảnh theo attachment_id thất bại:", err.response?.data || err.message);
        }
    }

    // 2. Dự phòng: Nếu có NOI_QUY_IMAGE_URL trong .env -> Gửi theo URL
    const imageUrl = process.env.NOI_QUY_IMAGE_URL;
    if (imageUrl) {
        await sendImageMessage(userId, imageUrl);
    }
}

/**
 * Gán tag người dùng trên Zalo OA.
 * Endpoint: POST https://openapi.zalo.me/v2.0/oa/tag/tagfollower
 * RÀNG BUỘC: Non-blocking try/catch để không làm gián đoạn phản hồi của bot.
 */
export async function setUserTagInZalo(userId: string, tagName: string): Promise<boolean> {
    try {
        let token = await ensureValidToken();
        let res = await axios.post(
            "https://openapi.zalo.me/v2.0/oa/tag/tagfollower",
            {
                user_id: userId,
                tag_name: tagName,
            },
            {
                headers: {
                    access_token: token,
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            }
        );

        if (res.data?.error === -216 || (typeof res.data?.message === "string" && res.data.message.toLowerCase().includes("token"))) {
            console.log("[zaloClient] Token hết hạn khi gán tag, thử refresh và gửi lại...");
            await refreshAccessToken();
            token = tokenState.accessToken;
            res = await axios.post(
                "https://openapi.zalo.me/v2.0/oa/tag/tagfollower",
                {
                    user_id: userId,
                    tag_name: tagName,
                },
                {
                    headers: {
                        access_token: token,
                        "Content-Type": "application/json",
                    },
                    timeout: 5000,
                }
            );
        }

        if (res.data?.error === 0) {
            console.log(`[zaloClient] Gán tag "${tagName}" cho user ${userId} thành công.`);
            return true;
        }

        console.warn(`[zaloClient] Phản hồi gán tag từ Zalo OA cho user ${userId}:`, res.data);
        return false;
    } catch (err: any) {
        console.warn(`[zaloClient] Lỗi khi gán tag Zalo OA cho user ${userId}:`, err.message);
        return false;
    }
}

export const syncUserTagToZaloOA = setUserTagInZalo;

/**
 * Gỡ nhãn người dùng khỏi Zalo OA.
 * Endpoint: POST https://openapi.zalo.me/v2.0/oa/tag/rmfollowerfromtag
 */
export async function removeUserTagInZalo(userId: string, tagName: string): Promise<boolean> {
    try {
        let token = await ensureValidToken();
        let res = await axios.post(
            "https://openapi.zalo.me/v2.0/oa/tag/rmfollowerfromtag",
            {
                user_id: userId,
                tag_name: tagName,
            },
            {
                headers: {
                    access_token: token,
                    "Content-Type": "application/json",
                },
                timeout: 5000,
            }
        );

        if (res.data?.error === -216 || (typeof res.data?.message === "string" && res.data.message.toLowerCase().includes("token"))) {
            console.log("[zaloClient] Token hết hạn khi gỡ tag, thử refresh và gửi lại...");
            await refreshAccessToken();
            token = tokenState.accessToken;
            res = await axios.post(
                "https://openapi.zalo.me/v2.0/oa/tag/rmfollowerfromtag",
                {
                    user_id: userId,
                    tag_name: tagName,
                },
                {
                    headers: {
                        access_token: token,
                        "Content-Type": "application/json",
                    },
                    timeout: 5000,
                }
            );
        }

        if (res.data?.error === 0) {
            console.log(`[zaloClient] Đã gỡ tag "${tagName}" khỏi user ${userId} thành công.`);
            return true;
        }

        console.warn(`[zaloClient] Phản hồi gỡ tag từ Zalo OA cho user ${userId}:`, res.data);
        return false;
    } catch (err: any) {
        console.warn(`[zaloClient] Lỗi khi gỡ tag Zalo OA cho user ${userId}:`, err.message);
        return false;
    }
}