import "dotenv/config";
import { generateReplyWithButtons } from "../src/replyEngine";
import { formatAdminTicketMessage } from "../src/ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "../src/config/adminConfig";

async function testAdminRequest() {
    console.log("==================================================");
    console.log("  TESTING USER 'ADMIN' CHAT REQUEST & NOTIFICATION ");
    console.log("==================================================");

    const testUserId = "zalo_admin_req_user_777";

    // 1. User messages "admin"
    console.log("\n--- [Khách nhắn]: 'admin' ---");
    const res1 = await generateReplyWithButtons("admin", testUserId);

    console.log("\nBot Reply sent to USER:\n");
    console.log(res1.replyText);

    if (res1.createdTicket) {
        console.log("\nSilent Notification sent to ADMIN:\n");
        console.log(formatAdminTicketMessage(res1.createdTicket));
    }

    // 2. User messages "gặp quản lý"
    console.log("\n--- [Khách nhắn]: 'em ở phòng 302 cần gặp quản lý gấp' ---");
    const res2 = await generateReplyWithButtons("em ở phòng 302 cần gặp quản lý gấp", testUserId);

    console.log("\nBot Reply sent to USER:\n");
    console.log(res2.replyText);

    if (res2.createdTicket) {
        console.log("\nSilent Notification sent to ADMIN:\n");
        console.log(formatAdminTicketMessage(res2.createdTicket));
    }

    const test1Pass = res1.createdTicket !== undefined && res1.replyText.includes("Ban Quản lý / Admin") && res1.replyText.includes(ADMIN_PHONE_NUMBER);
    const test2Pass = res2.createdTicket !== undefined && res2.createdTicket.roomNumber === "302";

    console.log("\n=== VERIFICATION ===");
    console.log("Case 'admin' handled & Ticket created for Admin:", test1Pass ? "✅ PASS" : "❌ FAIL");
    console.log("Case 'gặp quản lý' room 302 saved:", test2Pass ? "✅ PASS" : "❌ FAIL");

    if (test1Pass && test2Pass) {
        console.log("\n🎉 ADMIN REQUEST FEATURE TEST PASSED PERFECTLY!");
    } else {
        console.error("\n❌ TEST FAILED!");
        process.exit(1);
    }
}

testAdminRequest();
