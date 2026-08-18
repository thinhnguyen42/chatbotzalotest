import { createTicket, formatUserTicketMessage, formatAdminTicketMessage } from "../src/ticket/ticketService";

function testTicket() {
    console.log("=== TESTING TICKET SERVICE & CODE GENERATOR ===");

    // Create ticket 1 for Room 401
    const t1 = createTicket("user_123", "401", "Máy lạnh không mát", "điều hòa");
    console.log("Ticket 1 Code:", t1.ticketCode);
    console.log("\nUser Msg 1:\n", formatUserTicketMessage(t1));
    console.log("\nAdmin Msg 1:\n", formatAdminTicketMessage(t1));

    // Create ticket 2 for Room 401
    const t2 = createTicket("user_123", "401", "Vòi nước bị rò rỉ", "đường nước");
    console.log("\nTicket 2 Code:", t2.ticketCode);

    // Create ticket 1 for Room 302
    const t3 = createTicket("user_456", "302", "Mất điện phòng", "mất điện");
    console.log("Ticket 3 Code (Room 302):", t3.ticketCode);

    if (t1.ticketCode === "tk401001" && t2.ticketCode === "tk401002" && t3.ticketCode === "tk302001") {
        console.log("\n✅ TICKET CODE GENERATOR FORMAT TEST PASSED! (Format: tk<room><seq>)");
    } else {
        console.error("\n❌ TICKET TEST FAILED! Got:", t1.ticketCode, t2.ticketCode, t3.ticketCode);
        process.exit(1);
    }
}

testTicket();
