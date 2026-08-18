import { extractIntentAndEntities } from "../src/intentEngine";

function testIntent() {
    console.log("=== TESTING INTENT & ENTITY EXTRACTION ENGINE ===");

    // Test Case 1: Báo hỏng điều hòa ở phòng 302
    const res1 = extractIntentAndEntities("Máy lạnh phòng 302 bị chảy nước rồi", "302");
    console.log("\nCase 1 (Report Issue):", res1);

    // Test Case 2: Phàn nàn tiếng ồn
    const res2 = extractIntentAndEntities("Hàng xóm phòng bên hát karaoke ồn quá");
    console.log("\nCase 2 (Noise):", res2);

    // Test Case 3: Cảnh báo cháy
    const res3 = extractIntentAndEntities("Có khói cháy ở hành lang tầng 4 cứu với");
    console.log("\nCase 3 (Emergency):", res3);

    // Test Case 4: Hỏi tiền điện
    const res4 = extractIntentAndEntities("Tiền điện tháng này bao nhiêu 1 kwh ạ?");
    console.log("\nCase 4 (Billing):", res4);

    if (res1.intent === "REPORT_ISSUE" && res1.deviceType === "đường nước / rò rỉ" || res1.deviceType === "điều hòa" && res3.intent === "EMERGENCY") {
        console.log("\n✅ INTENT ENGINE TEST PASSED!");
    } else {
        console.error("\n❌ INTENT ENGINE TEST FAILED!");
        process.exit(1);
    }
}

testIntent();
