import * as larkClient from "../src/lark/larkClient";
import * as zaloClient from "../src/zaloClient";
import { processApprovedLink } from "../src/user/linkApproval";
import { getSession, clearSession } from "../src/memory/sessionMemory";
import { resolveUserRole, invalidateRoleCache } from "../src/user/userRoleService";

async function runLinkApprovalTests() {
    console.log("=== RUNNING TEST: Link Approval & Binding (Task 4) ===");

    const origGetContract = larkClient.getContractByPhone;
    const origMarkProcessed = larkClient.markLinkRequestAsProcessed;
    const origSendTextMessage = zaloClient.sendTextMessage;
    const origSetUserTagInZalo = zaloClient.setUserTagInZalo;

    let sentMessages: { userId: string; text: string }[] = [];
    let syncedTags: { userId: string; tag: string }[] = [];
    let markedProcessedIds: string[] = [];

    try {
        clearSession("tenant_zalo_123");
        invalidateRoleCache("tenant_zalo_123");

        (larkClient as any).getContractByPhone = async (phone: string) => {
            if (phone === "0912345678") {
                return {
                    recordId: "rec_tenant_401",
                    tenantName: "Nguyễn Văn A",
                    phone: "0912345678",
                    roomNumber: "401",
                    address: "38 Phan Bá Vành, P. Cát Lái",
                    tagCode: "38PBV-401",
                    role: "PRIMARY_LEASEHOLDER",
                };
            }
            return null;
        };

        (larkClient as any).markLinkRequestAsProcessed = async (recordId: string) => {
            markedProcessedIds.push(recordId);
            return true;
        };

        (zaloClient as any).sendTextMessage = async (userId: string, text: string) => {
            sentMessages.push({ userId, text });
        };

        (zaloClient as any).setUserTagInZalo = async (userId: string, tag: string) => {
            syncedTags.push({ userId, tag });
            return true;
        };

        // 1. Process valid approved link request
        const approvedReq: larkClient.LinkRequestRecord = {
            recordId: "req_approved_001",
            phone: "0912345678",
            zaloUserId: "tenant_zalo_123",
            tenantRecordId: "rec_tenant_401",
            status: "Đã duyệt",
            processedByBot: false,
        };

        const res = await processApprovedLink(approvedReq);
        console.log("Process result:", res);

        if (!res.success) {
            throw new Error(`Expected success, got error: ${res.error}`);
        }

        // Check session & role updated
        const session = getSession("tenant_zalo_123");
        console.log("Updated session:", session);
        if (session.role !== "PRIMARY_LEASEHOLDER" || session.roomNumber !== "401" || session.tagCode !== "38PBV-401") {
            throw new Error("Session was not updated with tenant role, room, and tag!");
        }

        const roleCtx = await resolveUserRole("tenant_zalo_123");
        console.log("Resolved role context:", roleCtx);
        if (roleCtx.role !== "PRIMARY_LEASEHOLDER" || roleCtx.tagCode !== "38PBV-401" || roleCtx.roomNumber !== "401") {
            throw new Error("Resolved role did not reflect active tenant!");
        }

        // Check Zalo notification sent (with room number now revealed!)
        if (sentMessages.length === 0) {
            throw new Error("Zalo confirmation message was not sent!");
        }
        const notif = sentMessages[0];
        console.log("Sent notification:", notif);
        if (!notif.text.includes("401") || !notif.text.includes("38PBV-401")) {
            throw new Error("Confirmation message must include room number and tag code!");
        }

        // Check non-blocking tag sync was invoked
        if (syncedTags.length === 0 || syncedTags[0].tag !== "38PBV-401") {
            throw new Error("setUserTagInZalo was not called with tag 38PBV-401");
        }

        // Check markLinkRequestAsProcessed called
        if (!markedProcessedIds.includes("req_approved_001")) {
            throw new Error("markLinkRequestAsProcessed was not called for req_approved_001");
        }

        // 2. Anti-double processing test: Processing the same request again should be a no-op
        const countBefore = sentMessages.length;
        const resDuplicate = await processApprovedLink(approvedReq);
        if (!resDuplicate.success) {
            throw new Error("Duplicate request should still return success gracefully");
        }
        if (sentMessages.length > countBefore) {
            throw new Error("Duplicate request should NOT re-send Zalo notification!");
        }
        console.log("✅ Anti-double processing verified!");

        console.log("\n=======================================================");
        console.log("🎉 ALL TASK 4 LINK APPROVAL TESTS PASSED SUCCESSFULLY!");
        console.log("=======================================================");

    } finally {
        (larkClient as any).getContractByPhone = origGetContract;
        (larkClient as any).markLinkRequestAsProcessed = origMarkProcessed;
        (zaloClient as any).sendTextMessage = origSendTextMessage;
        (zaloClient as any).setUserTagInZalo = origSetUserTagInZalo;
    }
}

runLinkApprovalTests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
