import * as larkClient from "../src/lark/larkClient";
import { handlePhoneClaim, extractPhoneNumber, resolveUserRole } from "../src/user/userRoleService";

describe("UserRoleService - Phone Claim Flow (Zero Information Disclosure)", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("extractPhoneNumber", () => {
        it("should extract valid Vietnamese phone numbers", () => {
            expect(extractPhoneNumber("SĐT 0912345678")).toBe("0912345678");
            expect(extractPhoneNumber("Liên hệ +84987654321")).toBe("0987654321");
            expect(extractPhoneNumber("0345678901")).toBe("0345678901");
        });

        it("should return null when no phone number is present", () => {
            expect(extractPhoneNumber("Chào bot, phòng còn trống không?")).toBeNull();
        });
    });

    describe("handlePhoneClaim", () => {
        it("Case A: Should create link request and return neutral reply when phone matches unbound contract", async () => {
            jest.spyOn(larkClient, "getContractByPhone").mockResolvedValue({
                recordId: "rec_tenant_001",
                tenantName: "Nguyễn Văn A",
                phone: "0912345678",
                roomNumber: "401",
                address: "38 Phan Bá Vành, Cát Lái",
                tagCode: "38PBV-401",
                role: "PRIMARY_LEASEHOLDER",
                zaloUserId: undefined,
            });

            const createLinkSpy = jest.spyOn(larkClient, "createLinkRequest").mockResolvedValue(true);

            const result = await handlePhoneClaim("SĐT của mình: 0912345678", "user_zalo_123", "User A");

            expect(result.handled).toBe(true);
            expect(createLinkSpy).toHaveBeenCalledWith("0912345678", "user_zalo_123", "User A", "rec_tenant_001");
            expect(result.replyText).toBe("Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.");

            // Zero Information Disclosure
            expect(result.replyText).not.toContain("401");
            expect(result.replyText).not.toContain("Phan Bá Vành");
            expect(result.replyText).not.toContain("Nguyễn Văn A");
        });

        it("Case B: Should NOT create link request and return neutral reply when contract is already bound (anti-overwrite)", async () => {
            jest.spyOn(larkClient, "getContractByPhone").mockResolvedValue({
                recordId: "rec_tenant_002",
                tenantName: "Trần Thị B",
                phone: "0988888888",
                roomNumber: "302",
                address: "38 Phan Bá Vành, Cát Lái",
                tagCode: "38PBV-302",
                role: "PRIMARY_LEASEHOLDER",
                zaloUserId: "existing_bound_user",
            });

            const createLinkSpy = jest.spyOn(larkClient, "createLinkRequest");

            const result = await handlePhoneClaim("Số điện thoại 0988888888", "attacker_user", "Attacker");

            expect(result.handled).toBe(true);
            expect(createLinkSpy).not.toHaveBeenCalled();
            expect(result.replyText).toBe("Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.");

            // Zero Information Disclosure
            expect(result.replyText).not.toContain("302");
            expect(result.replyText).not.toContain("Phan Bá Vành");
            expect(result.replyText).not.toContain("Trần Thị B");
        });

        it("Case C: Should return handled: false when phone does not match any contract", async () => {
            jest.spyOn(larkClient, "getContractByPhone").mockResolvedValue(null);
            const createLinkSpy = jest.spyOn(larkClient, "createLinkRequest");

            const result = await handlePhoneClaim("Tư vấn giúp em qua số 0900000000", "guest_user");

            expect(result.handled).toBe(false);
            expect(createLinkSpy).not.toHaveBeenCalled();
        });

        it("Case D: Should return handled: false when text has no phone number", async () => {
            const result = await handlePhoneClaim("Cho em hỏi bảng giá", "guest_user");
            expect(result.handled).toBe(false);
        });
    });
});
