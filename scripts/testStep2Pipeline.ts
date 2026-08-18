import "dotenv/config";
import { generateReplyWithButtons } from "../src/replyEngine";
import { getSession } from "../src/memory/sessionMemory";

async function testStep2Pipeline() {
    console.log("==================================================");
    console.log("  TESTING STEP 2: INTENT EXTRACTION & RICH UI ");
    console.log("==================================================");

    const testUserId = "zalo_rich_ui_user_777";

    // Lượt 1: Khách báo ở phòng 202 và máy lạnh chảy nước
    console.log("\n--- [Lượt 1] Khách: 'Em ở phòng 202, điều hòa bị chảy nước rồi' ---");
    const res1 = await generateReplyWithButtons("Em ở phòng 202, điều hòa bị chảy nước rồi", testUserId);
    console.log("Bot Text Reply:", res1.replyText);
    console.log("Extracted Intent:", res1.extractedIntent.intent);
    console.log("Extracted Device:", res1.extractedIntent.deviceType);
    console.log("Extracted Room:", res1.extractedIntent.roomNumber);
    console.log("Recommended Quick Reply Buttons:", res1.recommendedButtons);

    // Lượt 2: Khách hỏi tiền điện
    console.log("\n--- [Lượt 2] Khách: 'Cho em hỏi tiền điện tính sao ạ?' ---");
    const res2 = await generateReplyWithButtons("Cho em hỏi tiền điện tính sao ạ?", testUserId);
    console.log("Bot Text Reply:", res2.replyText);
    console.log("Extracted Intent:", res2.extractedIntent.intent);
    console.log("Recommended Quick Reply Buttons:", res2.recommendedButtons);

    if (
        res1.extractedIntent.intent === "REPORT_ISSUE" &&
        res1.extractedIntent.roomNumber === "202" &&
        res1.recommendedButtons.length > 0 &&
        res2.extractedIntent.intent === "BILLING"
    ) {
        console.log("\n✅ STEP 2 PIPELINE TEST PASSED!");
    } else {
        console.error("\n❌ STEP 2 PIPELINE TEST FAILED!");
        process.exit(1);
    }
}

testStep2Pipeline();
