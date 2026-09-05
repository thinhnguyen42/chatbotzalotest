import * as larkClient from "../src/lark/larkClient";
import * as linkApproval from "../src/user/linkApproval";
import { pollApprovedLinkRequests } from "../src/jobs/linkApprovalPoller";

async function runPollerTests() {
    console.log("=== RUNNING TEST: Link Approval Poller (Task 3B) ===");

    const origGetApproved = larkClient.getApprovedLinkRequests;
    const origProcessApproved = linkApproval.processApprovedLink;

    let processedRecords: any[] = [];

    try {
        // Setup mock: returns 2 approved requests, one is already processed, one is pending
        (larkClient as any).getApprovedLinkRequests = async () => {
            return [
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
            ];
        };

        (linkApproval as any).processApprovedLink = async (req: any) => {
            processedRecords.push(req);
            return { success: true };
        };

        const count = await pollApprovedLinkRequests();
        console.log("Poller processed count:", count);

        if (count !== 2) {
            throw new Error(`Expected 2 records to be processed, got ${count}`);
        }
        if (processedRecords.length !== 2) {
            throw new Error(`Expected processedRecords length 2, got ${processedRecords.length}`);
        }
        if (processedRecords[0].recordId !== "rec_req_01" || processedRecords[1].recordId !== "rec_req_02") {
            throw new Error("Processed records mismatch");
        }

        console.log("✅ Link Approval Poller test PASSED successfully!");
    } finally {
        (larkClient as any).getApprovedLinkRequests = origGetApproved;
        (linkApproval as any).processApprovedLink = origProcessApproved;
    }
}

runPollerTests().catch((err) => {
    console.error("❌ Poller test failed:", err);
    process.exit(1);
});
