import * as larkClient from "../src/lark/larkClient";
import * as linkApproval from "../src/user/linkApproval";
import { pollApprovedLinkRequests } from "../src/jobs/linkApprovalPoller";

describe("Link Approval Poller (Task 3B)", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should fetch approved link requests and process each unhandled request", async () => {
        jest.spyOn(larkClient, "getApprovedLinkRequests").mockResolvedValue([
            {
                recordId: "rec_req_01",
                phone: "0911111111",
                zaloUserId: "user_1",
                tenantRecordId: "tenant_rec_1",
                status: "Đã duyệt",
                processedByBot: false,
            },
            {
                recordId: "rec_req_02",
                phone: "0922222222",
                zaloUserId: "user_2",
                tenantRecordId: "tenant_rec_2",
                status: "Đã duyệt",
                processedByBot: false,
            },
        ]);

        const processSpy = jest.spyOn(linkApproval, "processApprovedLink").mockResolvedValue({ success: true });

        const count = await pollApprovedLinkRequests();

        expect(count).toBe(2);
        expect(processSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle empty list gracefully", async () => {
        jest.spyOn(larkClient, "getApprovedLinkRequests").mockResolvedValue([]);
        const processSpy = jest.spyOn(linkApproval, "processApprovedLink");

        const count = await pollApprovedLinkRequests();

        expect(count).toBe(0);
        expect(processSpy).not.toHaveBeenCalled();
    });
});
