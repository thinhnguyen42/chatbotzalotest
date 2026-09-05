import * as larkClient from "../src/lark/larkClient";
import * as zaloClient from "../src/zaloClient";
import { generateReplyWithButtons } from "../src/replyEngine";
import { updateSessionContext, getSession, clearSession } from "../src/memory/sessionMemory";
import { ADMIN_ZALO_USER_ID } from "../src/config/adminConfig";

async function runE2ETests() {
    console.log("=== RUNNING TEST: Admin Remove Tag E2E Flow ===");

    const origFindLink = larkClient.findActiveLinkByRoom;
    const origUnbind = larkClient.unbindLinkRequest;
    const origRemoveTag = zaloClient.removeUserTagInZalo;
    const origSendMsg = zaloClient.sendTextMessage;

    let removedTagCalled = false;
    let unbindCalled = false;
    let sentTenantMsg = false;

    try {
        const adminId = ADMIN_ZALO_USER_ID || "admin_test_id";
        process.env.ADMIN_ZALO_USER_IDS = adminId;

        clearSession("tenant_user_101");
        clearSession(adminId);

        updateSessionContext("tenant_user_101", {
            role: "PRIMARY_LEASEHOLDER",
            roomNumber: "101",
            tagCode: "38PBV-101",
            userName: "Nguyễn Văn A",
        });

        (larkClient as any).findActiveLinkByRoom = async (room: string) => {
            if (room === "101") {
                return {
                    linkRecordId: "rec_link_101",
                    zaloUserId: "tenant_user_101",
                    phone: "0912345678",
                    tagCode: "38PBV-101",
                    roomNumber: "101",
                    tenantName: "Nguyễn Văn A",
                };
            }
            return null;
        };

        (larkClient as any).unbindLinkRequest = async (id: string) => {
            if (id === "rec_link_101") unbindCalled = true;
            return true;
        };

        (zaloClient as any).removeUserTagInZalo = async (uid: string, tag: string) => {
            if (uid === "tenant_user_101" && tag === "38PBV-101") removedTagCalled = true;
            return true;
        };

        (zaloClient as any).sendTextMessage = async (uid: string, _msg: string) => {
            if (uid === "tenant_user_101") sentTenantMsg = true;
        };

        // 1. Admin sends "Toi muon go tag phong 101 nay"
        console.log("\n--- 1. Testing Admin sending 'Toi muon go tag phong 101 nay' ---");
        const adminReply = await generateReplyWithButtons("Toi muon go tag phong 101 nay", adminId);
        console.log("Admin reply:", adminReply.replyText);

        if (!adminReply.replyText.includes("Đã gỡ thành công tag [38PBV-101]")) {
            throw new Error(`Expected success reply, got: ${adminReply.replyText}`);
        }
        if (!removedTagCalled || !unbindCalled || !sentTenantMsg) {
            throw new Error("Missing unbind, tag removal, or tenant notification calls!");
        }

        const tenantSession = getSession("tenant_user_101");
        if (tenantSession.role === "PRIMARY_LEASEHOLDER" || tenantSession.roomNumber) {
            throw new Error("Tenant session was not reset!");
        }
        console.log("✅ Admin command executed perfectly!");

        // 2. Security Test: Non-admin user tries to send the same command -> MUST NOT REMOVE
        console.log("\n--- 2. Testing Non-admin user trying to remove tag ---");
        removedTagCalled = false;
        unbindCalled = false;

        const fakeAdminReply = await generateReplyWithButtons("Toi muon go tag phong 101 nay", "regular_guest_999");
        console.log("Regular user reply:", fakeAdminReply.replyText);

        if (fakeAdminReply.replyText.includes("Đã gỡ thành công tag")) {
            throw new Error("CRITICAL SECURITY FLAW: Regular user was able to execute Admin command!");
        }
        if (removedTagCalled || unbindCalled) {
            throw new Error("Regular user triggered tag unbind!");
        }
        console.log("✅ Security verified: Non-admin cannot remove tags!");

        console.log("\n=======================================================");
        console.log("🎉 ALL ADMIN REMOVE TAG E2E TESTS PASSED SUCCESSFULLY!");
        console.log("=======================================================");

    } finally {
        (larkClient as any).findActiveLinkByRoom = origFindLink;
        (larkClient as any).unbindLinkRequest = origUnbind;
        (zaloClient as any).removeUserTagInZalo = origRemoveTag;
        (zaloClient as any).sendTextMessage = origSendMsg;
    }
}

runE2ETests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
