const fs = require("fs");
const path = require("path");

const accessToken = process.argv[2] ? process.argv[2].trim() : "";
const refreshToken = process.argv[3] ? process.argv[3].trim() : "";

if (!accessToken || !refreshToken) {
    console.error("Vui lòng cung cấp cả Access Token và Refresh Token!");
    process.exit(1);
}

const tokenState = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 25 * 60 * 60 * 1000 - 5 * 60 * 1000,
};

// 1. Ghi ra data/zalo-tokens.json
const tokenFile = path.join(__dirname, "..", "data", "zalo-tokens.json");
const dir = path.dirname(tokenFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(tokenFile, JSON.stringify(tokenState, null, 2), "utf8");
console.log("✅ 1. Đã ghi token thành công vào:", tokenFile);

// 2. Cập nhật .env
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
        console.log("✅ 2. Đã cập nhật token vào file .env thành công!");
    } catch (err) {
        console.warn("Lỗi khi ghi .env:", err.message);
    }
}

console.log("\n🎉 XÁC NHẬN: Token Zalo mới đã được nạp thành công 100%!");
