import * as larkClient from "../src/lark/larkClient";
import * as zaloClient from "../src/zaloClient";
import { processApprovedLink } from "../src/user/linkApproval";
import { getSession, clearSession } from "../src/memory/sessionMemory";
import { resolveUserRole, invalidateRoleCache } from "../src/user/userRoleService";

describe("Link Approval and Official Tenant Binding (Task 4)", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should bind tenant, update session & cache, notify tenant with room/tag, and mark processed", async () => {
        clearSession("tenant_zalo_123");
        invalidateRoleCache("tenant_zalo_123");

        jest.spyOn(larkClient, "getContractByPhone").mockResolvedValue({
            recordId: "rec_tenant_401",
            tenantName: "Nguyễn Văn A",
            phone: "0912345678",
            roomNumber: "401",
            address: "38 Phan Bá Vành, P. Cát Lái",
            tagCode: "38PBV-401",
            role: "PRIMARY_LEASEHOLDER",
        });

        const markSpy = jest.spyOn(larkClient, "markLinkRequestAsProcessed").mockResolvedValue(true);
        const sendMsgSpy = jest.spyOn(zaloClient, "sendTextMessage").mockResolvedValue();
        const setTagSpy = jest.spyOn(zaloClient, "setUserTagInZalo").mockResolvedValue(true);

        const approvedReq: larkClient.LinkRequestRecord = {
            recordId: "req_approved_001",
            phone: "0912345678",
            zaloUserId: "tenant_zalo_123",
            tenantRecordId: "rec_tenant_401",
            status: "Đã duyệt",
            processedByBot: false,
        };

        const result = await processApprovedLink(approvedReq);

        expect(result.success).toBe(true);

        // Session updated
        const session = getSession("tenant_zalo_123");
        expect(session.role).toBe("PRIMARY_LEASEHOLDER");
        expect(session.roomNumber).toBe("401");
        expect(session.tagCode).toBe("38PBV-401");

        // Role resolved
        const roleCtx = await resolveUserRole("tenant_zalo_123");
        expect(roleCtx.role).toBe("PRIMARY_LEASEHOLDER");
        expect(roleCtx.tagCode).toBe("38PBV-401");

        // Zalo message sent with room & tag
        expect(sendMsgSpy).toHaveBeenCalledTimes(1);
        const sentContent = sendMsgSpy.mock.calls[0][1];
        expect(sentContent).toContain("401");
        expect(sentContent).toContain("38PBV-401");

        // Tag synced
        expect(setTagSpy).toHaveBeenCalledWith("tenant_zalo_123", "38PBV-401");

        // Marked processed in Lark Base
        expect(markSpy).toHaveBeenCalledWith("req_approved_001");
    });

    it("should prevent duplicate processing for the same request", async () => {
        const sendMsgSpy = jest.spyOn(zaloClient, "sendTextMessage").mockResolvedValue();
        const approvedReq: larkClient.LinkRequestRecord = {
            recordId: "req_approved_001", // already processed
            phone: "0912345678",
            zaloUserId: "tenant_zalo_123",
            tenantRecordId: "rec_tenant_401",
            status: "Đã duyệt",
            processedByBot: true,
        };

        const result = await processApprovedLink(approvedReq);
        expect(result.success).toBe(true);
        expect(sendMsgSpy).not.toHaveBeenCalled();
    });
});
