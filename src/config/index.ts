import dotenv from "dotenv";
import path from "node:path";

// Tải cấu hình từ file .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const CONFIG = {
  TOKEN: process.env.ZALO_BOT_TOKEN || "",
  LANG: process.env.ZALO_BOT_LANG || "vi",
  WEBHOOK_URL: process.env.ZALO_WEBHOOK_URL || "",
  WEBHOOK_SECRET: process.env.ZALO_WEBHOOK_SECRET || "default-secret-key",
  PORT: Number(process.env.PORT) || 3000,
  WHITELIST_USERS: (process.env.WHITELIST_USERS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
};

if (!CONFIG.TOKEN) {
  console.warn("[CẢNH BÁO]: Chưa cấu hình ZALO_BOT_TOKEN trong file .env!");
}
