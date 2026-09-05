import axios from "axios";
import {
    getContractByPhone,
    createLinkRequest,
    getApprovedLinkRequests,
    markLinkRequestAsProcessed,
    ContractRecord,
    LinkRequestRecord,
} from "../src/lark/larkClient";

async function runTests() {
    console.log("=== RUNNING TEST: larkClient MultiTable ===");

    // Save original axios post / get / put
    const origPost = axios.post;
    const origGet = axios.get;
    const origPut = axios.put;

    let mockTokenPost = false;
    let createdRecordPayload: any = null;
    let putPayload: any = null;

    try {
        // Setup mock axios
        (axios as any).post = async (url: string, body: any) => {
            if (url.includes("/tenant_access_token/internal")) {
                mockTokenPost = true;
                return { data: { code: 0, tenant_access_token: "mock_token_123" } };
            }
            if (url.includes("tbliWOdN1EkaYR4E/records")) {
                createdRecordPayload = body;
                return { data: { code: 0, data: { record: { record_id: "rec_link_new_999" } } } };
            }
            return { data: {} };
        };

        // 1. Test getContractByPhone - NOT FOUND
        (axios as any).get = async (url: string) => {
            if (url.includes("/records")) {
                return { data: { code: 0, data: { items: [], total: 0 } } };
            }
            return { data: {} };
        };

        const notFound = await getContractByPhone("0999999999");
        console.log("Not found test result:", notFound);
        if (notFound !== null) {
            throw new Error("Expected null for unknown phone");
        }

        // 2. Test getContractByPhone - FOUND
        (axios as any).get = async (url: string) => {
            if (url.includes("tblwnuR8PTRExg2B") && url.includes("/records")) {
                return {
                    data: {
                        code: 0,
                        data: {
                            items: [
                                {
                                    record_id: "rec_tenant_001",
                                    fields: {
                                        "Họ và tên cư dân": "Nguyễn Văn A",
                                        "Số điện thoại": "0912345678",
                                        "Phòng thuê": "38PBV-401",
                                        "Vai trò": "Chủ hộ",
                                        "Mã hợp đồng": "HD38PBV-401",
                                    },
                                },
                            ],
                            total: 1,
                        },
                    },
                };
            }
            if (url.includes("tbliWOdN1EkaYR4E") && url.includes("/records")) {
                // No approved link yet
                return { data: { code: 0, data: { items: [] } } };
            }
            return { data: {} };
        };

        const found = await getContractByPhone("0912345678");
        console.log("Found tenant result:", found);
        if (!found || found.recordId !== "rec_tenant_001" || found.tagCode !== "38PBV-401" || found.role !== "PRIMARY_LEASEHOLDER") {
            throw new Error("Failed to return correct ContractRecord");
        }

        // 3. Test getContractByPhone - ALREADY BOUND (anti-overwrite)
        (axios as any).get = async (url: string) => {
            if (url.includes("tblwnuR8PTRExg2B") && url.includes("/records")) {
                return {
                    data: {
                        code: 0,
                        data: {
                            items: [
                                {
                                    record_id: "rec_tenant_001",
                                    fields: {
                                        "Họ và tên cư dân": "Nguyễn Văn A",
                                        "Số điện thoại": "0912345678",
                                        "Phòng thuê": "38PBV-401",
                                        "Vai trò": "Chủ hộ",
                                    },
                                },
                            ],
                        },
                    },
                };
            }
            if (url.includes("tbliWOdN1EkaYR4E") && url.includes("/records")) {
                // Already approved for existing user
                return {
                    data: {
                        code: 0,
                        data: {
                            items: [
                                {
                                    record_id: "req_appr_1",
                                    fields: {
                                        "SDT": "0912345678",
                                        "ZALO USER ID": "zalo_existing_user",
                                        "TENANTS": ["rec_tenant_001"],
                                        "TRẠNG THÁI": "Đã duyệt",
                                    },
                                },
                            ],
                        },
                    },
                };
            }
            return { data: {} };
        };

        const alreadyBound = await getContractByPhone("0912345678");
        console.log("Already bound result:", alreadyBound);
        if (!alreadyBound || alreadyBound.zaloUserId !== "zalo_existing_user") {
            throw new Error("Failed to detect already bound Zalo User ID");
        }

        // 4. Test createLinkRequest
        const createOk = await createLinkRequest("0912345678", "zalo_new_user", "User Name", "rec_tenant_001");
        console.log("createLinkRequest result:", createOk, "payload:", createdRecordPayload);
        if (!createOk || createdRecordPayload?.fields?.["SDT"] !== "0912345678" || createdRecordPayload?.fields?.["TRẠNG THÁI"] !== "Chờ duyệt") {
            throw new Error("createLinkRequest failed to construct proper payload");
        }

        // 5. Test getApprovedLinkRequests
        (axios as any).get = async (url: string) => {
            if (url.includes("tbliWOdN1EkaYR4E/records")) {
                return {
                    data: {
                        code: 0,
                        data: {
                            items: [
                                {
                                    record_id: "req_approved_10",
                                    fields: {
                                        "SDT": "0987654321",
                                        "ZALO USER ID": "zalo_approved_user",
                                        "TENANTS": ["rec_tenant_555"],
                                        "TRẠNG THÁI": "Đã duyệt",
                                        "Đã xử lý bởi bot": false,
                                    },
                                },
                            ],
                        },
                    },
                };
            }
            return { data: {} };
        };

        const approvedList = await getApprovedLinkRequests();
        console.log("getApprovedLinkRequests result:", approvedList);
        if (approvedList.length !== 1 || approvedList[0].recordId !== "req_approved_10" || approvedList[0].zaloUserId !== "zalo_approved_user") {
            throw new Error("getApprovedLinkRequests failed");
        }

        // 6. Test markLinkRequestAsProcessed
        (axios as any).put = async (url: string, body: any) => {
            putPayload = body;
            return { data: { code: 0, data: { record: { record_id: "req_approved_10" } } } };
        };

        const markOk = await markLinkRequestAsProcessed("req_approved_10");
        console.log("markLinkRequestAsProcessed result:", markOk, "putPayload:", putPayload);
        if (!markOk || putPayload?.fields?.["Đã xử lý bởi bot"] !== true) {
            throw new Error("markLinkRequestAsProcessed failed to set Đã xử lý bởi bot = true");
        }

        console.log("✅ All Multi-Table LarkClient tests PASSED successfully!");
    } finally {
        (axios as any).post = origPost;
        (axios as any).get = origGet;
        (axios as any).put = origPut;
    }
}

runTests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
