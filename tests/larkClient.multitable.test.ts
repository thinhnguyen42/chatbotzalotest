import axios from "axios";
import {
    getContractByPhone,
    createLinkRequest,
    getApprovedLinkRequests,
    markLinkRequestAsProcessed,
    ContractRecord,
    LinkRequestRecord,
} from "../src/lark/larkClient";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("LarkClient Multi-Table Extension", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default tenant_access_token mock
        mockedAxios.post.mockImplementation((url: string) => {
            if (url.includes("/tenant_access_token/internal")) {
                return Promise.resolve({
                    data: { code: 0, tenant_access_token: "mock_token_123" },
                });
            }
            if (url.includes("/records")) {
                return Promise.resolve({
                    data: { code: 0, data: { record: { record_id: "rec_new_link_123" } } },
                });
            }
            return Promise.resolve({ data: {} });
        });
    });

    describe("getContractByPhone", () => {
        it("should return null when no tenant or contract matches the phone number", async () => {
            // Mock empty records returned from Lark
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes("/records")) {
                    return Promise.resolve({
                        data: {
                            code: 0,
                            data: { items: [], total: 0 },
                        },
                    });
                }
                return Promise.resolve({ data: {} });
            });

            const result = await getContractByPhone("0999999999");
            expect(result).toBeNull();
        });

        it("should find and return ContractRecord from TENANTS table when phone matches", async () => {
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes("/records")) {
                    return Promise.resolve({
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
                    });
                }
                return Promise.resolve({ data: {} });
            });

            const result = await getContractByPhone("0912345678");
            expect(result).not.toBeNull();
            expect(result?.recordId).toBe("rec_tenant_001");
            expect(result?.tenantName).toBe("Nguyễn Văn A");
            expect(result?.phone).toBe("0912345678");
            expect(result?.tagCode).toBe("38PBV-401");
            expect(result?.roomNumber).toBe("401");
            expect(result?.role).toBe("PRIMARY_LEASEHOLDER");
            expect(result?.zaloUserId).toBeUndefined();
        });

        it("should detect if contract/tenant already has a Zalo User ID linked (anti-overwrite)", async () => {
            // Mock TENANTS table returns record, and BOT_LINK_REQUESTS returns an approved link for this tenant
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes("tblwnuR8PTRExg2B") && url.includes("/records")) {
                    // TENANTS table
                    return Promise.resolve({
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
                    });
                }
                if (url.includes("tbliWOdN1EkaYR4E") && url.includes("/records")) {
                    // BOT_LINK_REQUESTS table: already has an approved link for rec_tenant_001 with zalo_user_existing
                    return Promise.resolve({
                        data: {
                            code: 0,
                            data: {
                                items: [
                                    {
                                        record_id: "req_approved_1",
                                        fields: {
                                            "SDT": "0912345678",
                                            "ZALO USER ID": "zalo_user_existing",
                                            "TENANTS": ["rec_tenant_001"],
                                            "TRẠNG THÁI": "Đã duyệt",
                                        },
                                    },
                                ],
                            },
                        },
                    });
                }
                return Promise.resolve({ data: {} });
            });

            const result = await getContractByPhone("0912345678");
            expect(result).not.toBeNull();
            expect(result?.recordId).toBe("rec_tenant_001");
            expect(result?.zaloUserId).toBe("zalo_user_existing");
        });
    });

    describe("createLinkRequest", () => {
        it("should create a record in BOT_LINK_REQUESTS table with PENDING status and link to tenant", async () => {
            let capturedUrl = "";
            let capturedBody: any = null;

            mockedAxios.post.mockImplementation((url: string, body: any) => {
                if (url.includes("/tenant_access_token/internal")) {
                    return Promise.resolve({
                        data: { code: 0, tenant_access_token: "mock_token_123" },
                    });
                }
                if (url.includes("tbliWOdN1EkaYR4E/records")) {
                    capturedUrl = url;
                    capturedBody = body;
                    return Promise.resolve({
                        data: { code: 0, data: { record: { record_id: "rec_link_new" } } },
                    });
                }
                return Promise.resolve({ data: {} });
            });

            const success = await createLinkRequest("0912345678", "zalo_new_user", "User Zalo Test", "rec_tenant_001");
            expect(success).toBe(true);
            expect(capturedUrl).toContain("tbliWOdN1EkaYR4E/records");
            expect(capturedBody.fields["SDT"]).toBe("0912345678");
            expect(capturedBody.fields["ZALO USER ID"]).toBe("zalo_new_user");
            expect(capturedBody.fields["TENANTS"]).toEqual(["rec_tenant_001"]);
            expect(capturedBody.fields["TRẠNG THÁI"]).toBe("Chờ duyệt");
        });
    });

    describe("getApprovedLinkRequests", () => {
        it("should fetch records with TRẠNG THÁI = 'Đã duyệt' and 'Đã xử lý bởi bot' != true", async () => {
            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes("tbliWOdN1EkaYR4E/records")) {
                    return Promise.resolve({
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
                    });
                }
                return Promise.resolve({ data: {} });
            });

            const items = await getApprovedLinkRequests();
            expect(items.length).toBe(1);
            expect(items[0].recordId).toBe("req_approved_10");
            expect(items[0].zaloUserId).toBe("zalo_approved_user");
            expect(items[0].tenantRecordId).toBe("rec_tenant_555");
            expect(items[0].status).toBe("Đã duyệt");
            expect(items[0].processedByBot).toBe(false);
        });
    });

    describe("markLinkRequestAsProcessed", () => {
        it("should update 'Đã xử lý bởi bot' = true on BOT_LINK_REQUESTS table", async () => {
            let capturedPutUrl = "";
            let capturedPutBody: any = null;

            mockedAxios.put.mockImplementation((url: string, body: any) => {
                capturedPutUrl = url;
                capturedPutBody = body;
                return Promise.resolve({
                    data: { code: 0, data: { record: { record_id: "req_approved_10" } } },
                });
            });

            const ok = await markLinkRequestAsProcessed("req_approved_10");
            expect(ok).toBe(true);
            expect(capturedPutUrl).toContain("tbliWOdN1EkaYR4E/records/req_approved_10");
            expect(capturedPutBody.fields["Đã xử lý bởi bot"]).toBe(true);
        });
    });
});
