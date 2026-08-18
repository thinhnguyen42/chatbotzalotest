import "dotenv/config";
import { generateReplyWithButtons } from "../src/replyEngine";
import { formatAdminTicketMessage, GENERAL_SLOT_FILLING_REPLY } from "../src/ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "../src/config/adminConfig";

async function testRevisedTicketPipeline() {
    console.log("=========================================================");
    console.log("  TESTING REVISED 2-STEP SLOT FILLING & GUARDRAIL FLOW  ");
    console.log("=========================================================");

    const testUserId = "zalo_revised_user_999";

    // TEST CASE 1: Người dùng chỉ báo chung chung ("Phòng tôi có sự cố")
    console.log("\n--- [CASE 1] Khách nhắn chung chung: 'Phòng em bị hỏng đồ, gọi thợ với' ---");
    const res1 = await generateReplyWithButtons("Phòng em bị hỏng đồ, gọi thợ với", testUserId);

    console.log("\nBot Reply output to User:");
    console.log(res1.replyText);
    console.log("Is Ticket Created?:", res1.createdTicket ? "YES (FAILED!)" : "NO (CORRECT!)");

    // TEST CASE 2: Người dùng cung cấp thiết bị cụ thể ("Hỏng điều hòa ở phòng 401")
    console.log("\n--- [CASE 2] Khách nhắn cụ thể: 'Em ở phòng 401, máy lạnh bị hỏng không mát' ---");
    const res2 = await generateReplyWithButtons("Em ở phòng 401, máy lạnh bị hỏng không mát", testUserId);

    console.log("\nBot Reply output to User:");
    console.log(res2.replyText);
    console.log("Is Ticket Created?:", res2.createdTicket ? `YES #${res2.createdTicket.ticketCode}` : "NO");

    if (res2.createdTicket) {
        console.log("\nSilent Admin Notification Message (Internal Only):");
        console.log(formatAdminTicketMessage(res2.createdTicket));
    }

    // VERIFICATIONS & GUARDRAILS
    const case1Pass = res1.createdTicket === undefined && res1.replyText.includes("thiết bị nào đang gặp sự cố");
    const case2Pass = res2.createdTicket !== undefined && res2.createdTicket.ticketCode === "tk401001" && res2.replyText.startsWith("🎫 [PHIẾU BÁO SỰ CỐ - #tk401001]");
    const guardrailPass = !res2.replyText.includes("Khách hàng ID") && !res2.replyText.includes("CẦN XỬ LÝ");

    console.log("\n=== VERIFICATION RESULTS ===");
    console.log("Step 1 (Slot filling question for general inquiry):", case1Pass ? "✅ PASS" : "❌ FAIL");
    console.log("Step 2 (Exact 🎫 Ticket format for specific device):", case2Pass ? "✅ PASS" : "❌ FAIL");
    console.log("Strict Guardrails (No internal admin info in user chat):", guardrailPass ? "✅ PASS" : "❌ FAIL");

    if (case1Pass && case2Pass && guardrailPass) {
        console.log("\n🎉 ALL REVISED TICKET FLOW TESTS & GUARDRAILS PASSED!");
    } else {
        console.error("\n❌ TESTS FAILED!");
        process.exit(1);
    }
}

testRevisedTicketPipeline();
