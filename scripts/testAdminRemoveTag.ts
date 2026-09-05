import * as larkClient from "../src/lark/larkClient";
import * as zaloClient from "../src/zaloClient";
import { handleAdminRemoveTag } from "../src/user/adminTagService";
import { getSession, updateSessionContext } from "../src/memory/sessionMemory";
import { resolveUserRole } from "../src/user/userRoleService";

async function runTests() {
    console.log("=== RUNNING TEST: Admin Remove Tag Flow ===");

    const origFindLink = larkClient.findActiveLinkByRoom;
    const origUnbind = larkClient.unbindLinkRequest;
    const origRemoveTag = zaloClient.removeUserTagInZalo;
    const origSendMsg = zaloClient.sendTextMessage;

    let removedTagCalled = false;
    let unbindCalled = false;
    let sentTenantMsg = false;

    try {
        // Setup initial tenant session
        updateSessionContext("tenant_user_99", {
            role: "PRIMARY_LEASEHOLDER",
            roomNumber: "101",
            tagCode: "38PBV-101",
            userName: "Nguyễn Văn A",
        });

        (larkClient as any).findActiveLinkByRoom = async (room: string) => {
            if (room === "101") {
                return {
                    linkRecordId: "rec_link_101",
                    zaloUserId: "tenant_user_99",
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
            if (uid === "tenant_user_99" && tag === "38PBV-101") removedTagCalled = true;
            return true;
        };

        (zaloClient as any).sendTextMessage = async (uid: string, _msg: string) => {
            if (uid === "tenant_user_99") sentTenantMsg = true;
        };

        // 1. Test Admin command: "Toi muon go tag phong 101 nay"
        const res1 = await handleAdminRemoveTag("Toi muon go tag phong 101 nay", "admin_user_id");
        console.log("Admin command result:", res1);

        if (!res1.handled || !res1.replyText?.includes("Đã gỡ thành công tag [38PBV-101]")) {
            throw new Error(`Expected success message, got: ${res1.replyText}`);
        }
        if (!removedTagCalled) {
            throw new Error("removeUserTagInZalo should have been called!");
        }
        if (!unbindCalled) {
            throw new Error("unbindLinkRequest should have been called!");
        }

        // Verify session reset
        const session = getSession("tenant_user_99");
        console.log("Session after unbind:", session);
        if (session.role === "PRIMARY_LEASEHOLDER" || session.roomNumber) {
            throw new Error("Session was not reset for unlinked tenant!");
        }

        // 2. Test room not found: "gỡ tag phòng 999"
        const res2 = await handleAdminRemoveTag("gỡ tag phòng 999", "admin_user_id");
        console.log("Not found result:", res2);
        if (!res2.handled || !res2.replyText?.includes("Không tìm thấy")) {
            throw new Error("Expected not found message");
        }

        // 3. Test non-remove message
        const res3 = await handleAdminRemoveTag("Xin chào bot", "admin_user_id");
        if (res3.handled !== false) {
            throw new Error("Non-remove message should return handled: false");
        }

        console.log("\n=======================================================");
        console.log("🎉 ALL ADMIN REMOVE TAG TESTS PASSED SUCCESSFULLY!");
        console.log("=======================================================");

    } finally {
        (larkClient as any).findActiveLinkByRoom = origFindLink;
        (larkClient as any).unbindLinkRequest = origUnbind;
        (zaloClient as any).removeUserTagInZalo = origRemoveTag;
        (zaloClient as any).sendTextMessage = origSendMsg;
    }
}

runTests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
