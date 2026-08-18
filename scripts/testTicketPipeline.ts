import "dotenv/config";
import { generateReplyWithButtons } from "../src/replyEngine";
import { createTicket, formatUserTicketMessage, formatAdminTicketMessage, ISSUE_GUIDANCE_TEMPLATE } from "../src/ticket/ticketService";
import { ADMIN_PHONE_NUMBER } from "../src/config/adminConfig";

async function testTicketPipeline() {
    console.log("==================================================");
    console.log("  TESTING CUSTOM ISSUE REPORTING & TICKET PIPELINE ");
    console.log("==================================================");

    const testUserId = "zalo_ticket_user_888";

    // 1. Kiểm tra SĐT Admin
    console.log("Admin Phone Configured:", ADMIN_PHONE_NUMBER);

    // 2. Khách báo hỏng điều hòa ở phòng 401
    console.log("\n--- [Lượt 1] Khách: 'Em ở phòng 401, máy lạnh không mát' ---");
    const res1 = await generateReplyWithButtons("Em ở phòng 401, máy lạnh không mát", testUserId);

    console.log("\nBot Guidance Reply:\n", res1.replyText);

    // 3. Giả lập tạo Ticket tự động trong server
    const ticket1 = createTicket(testUserId, res1.extractedIntent.roomNumber, "Em ở phòng 401, máy lạnh không mát", res1.extractedIntent.deviceType);

    console.log("\nGenerated Ticket Code:", ticket1.ticketCode);
    console.log("\n[Dispatch to User]:\n", formatUserTicketMessage(ticket1));
    console.log("\n[Dispatch to Admin]:\n", formatAdminTicketMessage(ticket1));

    // Assertions
    const isGuidanceMatch = res1.replyText.includes("trang thiết bị trong phòng") && res1.replyText.includes("Thiết bị gặp sự cố");
    const isTicketCodeMatch = ticket1.ticketCode === "tk401001";
    const isAdminPhoneMatch = ADMIN_PHONE_NUMBER === "0335395573";

    if (isGuidanceMatch && isTicketCodeMatch && isAdminPhoneMatch) {
        console.log("\n✅ CUSTOM TICKET PIPELINE TEST PASSED!");
    } else {
        console.error("\n❌ TEST FAILED!");
        console.error("isGuidanceMatch:", isGuidanceMatch, "isTicketCodeMatch:", isTicketCodeMatch, "isAdminPhoneMatch:", isAdminPhoneMatch);
        process.exit(1);
    }
}

testTicketPipeline();
