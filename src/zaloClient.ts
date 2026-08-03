import axios from "axios";
import fs from "fs";
import path from "path";

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

async function refreshAccessToken(): Promise<void> {
    try {
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
            console.error("[zaloClient] ⚠️ Không refresh được token Zalo:", data);
            throw new Error("Không refresh được token: " + JSON.stringify(data));
        }

        tokenState = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || tokenState.refreshToken,
            expiresAt: Date.now() + 25 * 60 * 60 * 1000 - 5 * 60 * 1000,
        };

        saveTokenState(tokenState);
        console.log("[zaloClient] Đã refresh access token mới thành công!");
    } catch (err: any) {
        console.error("[zaloClient] Lỗi khi refresh access token:", err.response?.data || err.message);
        throw err;
    }
}

async function ensureValidToken(): Promise<string> {
    if (!tokenState.accessToken) {
        await refreshAccessToken();
    }
    return tokenState.accessToken;
}

export async function sendTextMessage(userId: string, text: string): Promise<void> {
    let token = await ensureValidToken();

    try {
        await axios.post(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            {
                recipient: { user_id: userId },
                message: { text },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    access_token: token,
                },
            }
        );
        console.log(`[zaloClient] Đã gửi tin nhắn thành công tới user: ${userId}`);
    } catch (err: any) {
        const errData = err.response?.data;
        console.error("[zaloClient] Gửi tin thất bại lần 1:", errData || err.message);

        // Nếu lỗi do hết hạn token (lỗi -216 hoặc lỗi token), thử refresh 1 lần và gửi lại
        if (errData?.error < 0 || errData?.message?.includes("token")) {
            try {
                console.log("[zaloClient] Thử refresh token và gửi lại...");
                await refreshAccessToken();
                token = tokenState.accessToken;
                await axios.post(
                    "https://openapi.zalo.me/v3.0/oa/message/cs",
                    {
                        recipient: { user_id: userId },
                        message: { text },
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            access_token: token,
                        },
                    }
                );
                console.log(`[zaloClient] Thử lại thành công! Đã gửi tin tới user: ${userId}`);
                return;
            } catch (retryErr: any) {
                console.error("[zaloClient] Thử lại thất bại:", retryErr.response?.data || retryErr.message);
            }
        }
        throw err;
    }
}

export async function notifyAdmin(text: string): Promise<void> {
    const adminUserId = process.env.ZALO_ADMIN_USER_ID;
    if (!adminUserId) {
        console.log("[zaloClient] Bỏ qua gửi admin (Chưa cấu hình ZALO_ADMIN_USER_ID trong .env)");
        return;
    }

    try {
        await sendTextMessage(adminUserId, text);
        console.log("[zaloClient] Đã gửi thông báo cho Admin thành công!");
    } catch (err: any) {
        console.error("[zaloClient] Lỗi khi gửi thông báo cho Admin:", err.message);
    }
}

export async function sendImageMessage(userId: string, imageUrl: string): Promise<void> {
    if (!imageUrl) return;
    const token = await ensureValidToken();

    try {
        await axios.post(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            {
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
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    access_token: token,
                },
            }
        );
        console.log(`[zaloClient] Đã gửi ảnh thành công tới user: ${userId}`);
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
    const localPath = path.join(__dirname, "..", "public", "noiQuy.jpg");
    const fallbackKbPath = path.join(__dirname, "..", "data", "knowledge-base", "noiQuy.jpg");
    const targetPath = fs.existsSync(localPath) ? localPath : fallbackKbPath;

    if (!fs.existsSync(targetPath)) {
        console.warn("[zaloClient] Không tìm thấy file noiQuy.jpg tại:", targetPath);
        return;
    }

    // 1. Thử upload trực tiếp file ảnh local lên Zalo OA CDN lấy attachment_id
    if (!cachedNoiQuyAttachmentId) {
        cachedNoiQuyAttachmentId = await uploadLocalImageToZalo(targetPath);
    }

    if (cachedNoiQuyAttachmentId) {
        const token = await ensureValidToken();
        try {
            await axios.post(
                "https://openapi.zalo.me/v3.0/oa/message/cs",
                {
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
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        access_token: token,
                    },
                }
            );
            console.log(`[zaloClient] Đã gửi ảnh noiQuy.jpg thành công tới user: ${userId}`);
            return;
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