import { getSession, addMessageToSession, updateSessionContext, getRecentHistory, clearSession } from "../src/memory/sessionMemory";

async function testMemory() {
    console.log("--- TEST SESSION MEMORY ---");
    const testUser = "user_test_123";

    clearSession(testUser);

    // 1. Kiểm tra khởi tạo
    const s1 = getSession(testUser);
    console.log("Initial session:", s1);

    // 2. Thêm lịch sử tin nhắn
    addMessageToSession(testUser, "user", "Chào bot, cho mình hỏi giờ mở cửa?");
    addMessageToSession(testUser, "assistant", "Bên mình mở cửa từ 8:00 - 21:00 nhé ạ.");
    addMessageToSession(testUser, "user", "Mình ở phòng 202");

    // 3. Cập nhật số phòng
    updateSessionContext(testUser, { roomNumber: "202" });

    // 4. Lấy thông tin session & history
    const s2 = getSession(testUser);
    console.log("Updated session room:", s2.roomNumber);
    console.log("Recent history:", getRecentHistory(testUser));

    if (s2.roomNumber === "202" && s2.history.length === 3) {
        console.log("✅ SESSION MEMORY TEST PASSED!");
    } else {
        console.error("❌ TEST FAILED!");
        process.exit(1);
    }
}

testMemory();
