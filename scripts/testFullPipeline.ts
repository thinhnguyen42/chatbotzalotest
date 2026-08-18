import "dotenv/config";
import { generateReply } from "../src/replyEngine";
import { getSession, getRecentHistory } from "../src/memory/sessionMemory";

async function testFullPipeline() {
    console.log("==========================================");
    console.log("  TESTING MULTI-TURN CONVERSATION PIPELINE ");
    console.log("==========================================");

    const testUserId = "zalo_user_test_999";

    // Lượt 1: Khách thông báo số phòng
    console.log("\n--- [Lượt 1] Khách: 'Em ở phòng 401' ---");
    const reply1 = await generateReply("Em ở phòng 401", testUserId);
    console.log("Bot reply:", reply1);

    const session1 = getSession(testUserId);
    console.log("Session Room Number state:", session1.roomNumber);

    // Lượt 2: Khách hỏi giờ mở cửa
    console.log("\n--- [Lượt 2] Khách: 'Cho em hỏi giờ làm việc bên mình?' ---");
    const reply2 = await generateReply("Cho em hỏi giờ làm việc bên mình?", testUserId);
    console.log("Bot reply:", reply2);

    // Lượt 3: Kiểm tra lịch sử lưu trữ
    console.log("\n--- [Lịch sử hội thoại trong Session Store] ---");
    const history = getRecentHistory(testUserId);
    history.forEach((h, i) => {
        console.log(`${i + 1}. [${h.role.toUpperCase()}]: ${h.content}`);
    });

    if (session1.roomNumber === "401" && history.length >= 4) {
        console.log("\n✅ FULL PIPELINE MULTI-TURN TEST PASSED!");
    } else {
        console.error("\n❌ FULL PIPELINE TEST FAILED!");
        process.exit(1);
    }
}

testFullPipeline();
