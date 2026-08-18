import "dotenv/config";
import { generateReplyWithButtons } from "../src/replyEngine";
import { formatAdminTicketMessage, GENERAL_SLOT_FILLING_REPLY } from "../src/ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "../src/config/adminConfig";

async function testUserTicketFormat() {
    console.log("=========================================================");
    console.log("  TESTING USER TICKET REPLY FORMAT & ADMIN TICKET DISPATCH");
    console.log("=========================================================");

    const testUserId = "zalo_user_ticket_fmt_111";

    console.log("\n--- [Khách nhắn]: 'phòng 401 bị hỏng đèn r' ---");
    const res = await generateReplyWithButtons("phòng 401 bị hỏng đèn r", testUserId);

    console.log("\nBot Reply sent to USER:\n");
    console.log(res.replyText);

    if (res.createdTicket) {
        console.log("\nSilent Ticket sent to ADMIN:\n");
        console.log(formatAdminTicketMessage(res.createdTicket));
    }

    const hasWarmGreeting = res.replyText.includes("phòng 401");
    const hasTicketCode = res.createdTicket !== undefined && res.createdTicket.ticketCode === "tk401001";
    const hasAdminHotline = res.replyText.includes(ADMIN_PHONE_NUMBER);

    console.log("\n=== VERIFICATION ===");
    console.log("Warm user greeting with room 401:", hasWarmGreeting ? "✅ PASS" : "❌ FAIL");
    console.log("Ticket tk401001 generated:", hasTicketCode ? "✅ PASS" : "❌ FAIL");
    console.log("Hotline included:", hasAdminHotline ? "✅ PASS" : "❌ FAIL");

    if (hasWarmGreeting && hasTicketCode && hasAdminHotline) {
        console.log("\n🎉 TEST PASSED PERFECTLY!");
    } else {
        console.error("\n❌ TEST FAILED!");
        process.exit(1);
    }
}

testUserTicketFormat();
