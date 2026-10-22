const fs = require("fs");
const path = require("path");

const accessToken = "m0UtKvKHp7ZB0B9Sa1B4UCyAl5-M1SCwhr2rG8evgcMeQ8e4XZsz9v5Fl5cGMha-oqtFIV4RrndCIDH5sm7A78CDu6pN6i8It7QuIkGdeXB4RwjAa03S2CH8f5_R7BazWsI06vydhsQ4Igm7l2goGwP3j1Yb5xrpYrsyCzCtmsdNE-T9q4p8Q_eWpmpHHiLxwJ2w6T1ypJFk5CuOxdJKKzSVyGgE2U1uZbdX9Ratc76ZKvSg-n2NR_1BwI_L2UPx_4B59Bmvvd-1RDq3jGhQPQzCf3Yt7RjjbWp45Of2nqke3-Cxbdp66xmlpMMzFC8NvdY-VV46jHdiQiDYwW_K5x9lss6xFlOzb6-LOyrxgaZC1Rmjy4p63j1UudZH5yKJrMRQUjGH_3pWST4VvnReMSn-dYBN6Ra2r5EXV6qXJXEP2CXq";
const refreshToken = "qDv9Al94ln7RsKmbzqUt4T_JGYRnKDTnqv9P7ATfsMxJ_KqrcHNF1hUFHKkR4xCVsUioSuXonXNZdZLNWrl49CEfTXQiLzPV_ibH7vD9t4lkqIyipKsDVRcM7GJWQf19kBOzEUOYc5wI_GeEnXUEGUhY0J2UBBLczl9E7BWmmKYGx7CcupNM5OZ08qNz9hKfkED3Hz0syXAioGLLnms7Eul37GdmLxOvYzSnTTiZm3wNkJLnwtU359o_U7wpVEqVyvvRVwPXz4_Hb7KAh6-4GE2G3mcBQ9PpzBmH1e16dKl5hJLzj6Y2Jvk6CW_CIRD9jO4qUPXzd2puj3qNc5VEOyk_QG6vKF9lneL958b0s4NTm4jqipxW7vdOJqpcCCOQcVvrAym7ubk1ssKKIngjmmF-NRiT";

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

console.log("\n🎉 HOÀN TẤT: Cặp token Zalo OA đã được nạp thành công 100%!");
