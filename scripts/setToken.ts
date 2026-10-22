import fs from "fs";
import path from "path";
import axios from "axios";

const accessToken = process.argv[2]?.trim();
const refreshToken = process.argv[3]?.trim();

if (!accessToken || !refreshToken) {
    console.error("Vui lòng cung cấp cả Access Token và Refresh Token!");
    console.log("Cú pháp: npx ts-node scripts/setToken.ts <ACCESS_TOKEN> <REFRESH_TOKEN>");
    process.exit(1);
}

async function verifyAndSave() {
    console.log("Đang kiểm tra tính hợp lệ của Access Token với Zalo API...");
    try {
        // Kiểm tra token bằng cách gọi thử API profile hoặc getoa
        const res = await axios.get("https://openapi.zalo.me/v2.0/oa/getoa", {
            headers: { access_token: accessToken },
        });

        if (res.data && res.data.error !== 0) {
            console.warn(`[Cảnh báo] Zalo API phản hồi mã lỗi ${res.data.error}: ${res.data.message}`);
        } else {
            console.log("✅ Access Token hoàn toàn hợp lệ! Tên OA:", res.data?.data?.name || "Official Account");
        }
    } catch (err: any) {
        console.warn("[Cảnh báo] Không thể kiểm tra trước token với Zalo API:", err.message);
    }

    const tokenState = {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 25 * 60 * 60 * 1000 - 5 * 60 * 1000,
    };

    // 1. Lưu vào data/zalo-tokens.json
    const tokenFile = path.join(__dirname, "..", "data", "zalo-tokens.json");
    const dir = path.dirname(tokenFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify(tokenState, null, 2), "utf8");
    console.log("✅ Đã ghi vào data/zalo-tokens.json");

    // 2. Cập nhật file .env
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
        try {
            let envContent = fs.readFileSync(envPath, "utf8");
            if (envContent.includes("ZALO_ACCESS_TOKEN=")) {
                envContent = envContent.replace(/^ZALO_ACCESS_TOKEN=.*/m, `ZALO_ACCESS_TOKEN=${accessToken}`);
            } else {
                envContent += `\nZALO_ACCESS_TOKEN=${accessToken}`;
            }

            if (envContent.includes("ZALO_REFRESH_TOKEN=")) {
                envContent = envContent.replace(/^ZALO_REFRESH_TOKEN=.*/m, `ZALO_REFRESH_TOKEN=${refreshToken}`);
            } else {
                envContent += `\nZALO_REFRESH_TOKEN=${refreshToken}`;
            }

            fs.writeFileSync(envPath, envContent, "utf8");
            console.log("✅ Đã cập nhật file .env");
        } catch (err: any) {
            console.warn("Lỗi khi ghi .env:", err.message);
        }
    }

    console.log("\n🎉 HOÀN TẤT CẬP NHẬT TOKEN! Bạn hãy restart bot hoặc gõ: pm2 restart zalo-chatbot");
}

verifyAndSave();
