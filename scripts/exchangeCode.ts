import "dotenv/config";
import { exchangeCodeAndSaveTokens } from "../src/zaloClient";

const code = process.argv[2];

if (!code) {
    console.error("❌ Vui lòng truyền authorization code từ Zalo!");
    console.log("👉 Cách dùng: npm run token:exchange <CODE_TU_TRINH_DUYET>");
    process.exit(1);
}

async function main() {
    console.log("🔄 Đang gửi yêu cầu đổi code lấy Access Token & Refresh Token mới...");
    const res = await exchangeCodeAndSaveTokens(code);

    if (res.success) {
        console.log("\n🎉 ĐỔI TOKEN THÀNH CÔNG!");
        console.log(`- Access Token: ${res.data.access_token.substring(0, 35)}...`);
        console.log(`- Refresh Token: ${res.data.refresh_token.substring(0, 35)}...`);
        console.log("💾 Đã lưu tự động vào data/zalo-tokens.json và file .env!");
        console.log("\n🚀 Bạn có thể chạy 'npm run dev' và test lại Bot trên Zalo rồi nha!");
    } else {
        console.error("\n❌ Zalo từ chối đổi code. Chi tiết:", res.error);
    }
}

main();
