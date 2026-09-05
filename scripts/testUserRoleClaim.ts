import * as larkClient from "../src/lark/larkClient";
import { handlePhoneClaim, extractPhoneNumber, resolveUserRole } from "../src/user/userRoleService";

async function runTests() {
    console.log("=== RUNNING TEST: userRoleService Phone Claim Flow ===");

    // Save original getContractByPhone and createLinkRequest
    const origGetContractByPhone = larkClient.getContractByPhone;
    const origCreateLinkRequest = larkClient.createLinkRequest;

    let createLinkRequestCalled = false;
    let createLinkRequestArgs: any = null;

    try {
        // 1. Test extractPhoneNumber
        console.log("\n--- 1. Testing extractPhoneNumber ---");
        const p1 = extractPhoneNumber("SĐT của mình là 0912345678 nha");
        if (p1 !== "0912345678") throw new Error(`Expected '0912345678', got '${p1}'`);

        const p2 = extractPhoneNumber("alo dt: +84987654321");
        if (p2 !== "0987654321") throw new Error(`Expected '0987654321', got '${p2}'`);

        const p3 = extractPhoneNumber("tôi muốn hỏi phòng trống");
        if (p3 !== null) throw new Error(`Expected null, got '${p3}'`);
        console.log("✅ extractPhoneNumber passed!");

        // 2. Case A: Phone matches contract & NOT bound yet -> creates link request, returns neutral reply
        console.log("\n--- 2. Testing Case A: Unbound Contract Claim ---");
        (larkClient as any).getContractByPhone = async (phone: string) => {
            if (phone === "0912345678") {
                return {
                    recordId: "rec_tenant_001",
                    tenantName: "Nguyễn Văn A",
                    phone: "0912345678",
                    roomNumber: "401",
                    address: "38 Phan Bá Vành",
                    tagCode: "38PBV-401",
                    role: "PRIMARY_LEASEHOLDER",
                    zaloUserId: undefined, // NOT bound yet
                };
            }
            return null;
        };

        (larkClient as any).createLinkRequest = async (phone: string, zaloUserId: string, displayName: string, contractId: string) => {
            createLinkRequestCalled = true;
            createLinkRequestArgs = { phone, zaloUserId, displayName, contractId };
            return true;
        };

        createLinkRequestCalled = false;
        createLinkRequestArgs = null;

        const resA = await handlePhoneClaim("SĐT của mình là 0912345678", "user_zalo_111", "Anh A");
        console.log("Case A result:", resA);

        if (!resA.handled) {
            throw new Error("Case A should be handled");
        }
        if (!createLinkRequestCalled) {
            throw new Error("Case A should have called createLinkRequest");
        }
        if (createLinkRequestArgs.phone !== "0912345678" || createLinkRequestArgs.zaloUserId !== "user_zalo_111" || createLinkRequestArgs.contractId !== "rec_tenant_001") {
            throw new Error(`Case A called createLinkRequest with incorrect args: ${JSON.stringify(createLinkRequestArgs)}`);
        }

        // ZERO INFORMATION DISCLOSURE TEST
        if (resA.replyText?.includes("401") || resA.replyText?.includes("Phan Bá Vành") || resA.replyText?.includes("Nguyễn Văn A") || resA.replyText?.includes("38PBV")) {
            throw new Error(`CRITICAL SECURITY FAILURE: Zero Information Disclosure violated in Case A! Reply: ${resA.replyText}`);
        }
        if (resA.replyText !== "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.") {
            throw new Error(`Expected neutral reply message, got: ${resA.replyText}`);
        }
        console.log("✅ Case A passed with Zero Information Disclosure!");

        // 3. Case B: Phone matches contract BUT already bound to another Zalo UID -> ANTI-OVERWRITE
        console.log("\n--- 3. Testing Case B: Already Bound Contract (Anti-Overwrite) ---");
        (larkClient as any).getContractByPhone = async (phone: string) => {
            if (phone === "0988888888") {
                return {
                    recordId: "rec_tenant_002",
                    tenantName: "Trần Thị B",
                    phone: "0988888888",
                    roomNumber: "302",
                    address: "38 Phan Bá Vành",
                    tagCode: "38PBV-302",
                    role: "PRIMARY_LEASEHOLDER",
                    zaloUserId: "user_zalo_ORIGINAL", // ALREADY BOUND
                };
            }
            return null;
        };

        createLinkRequestCalled = false;
        createLinkRequestArgs = null;

        const resB = await handlePhoneClaim("Tôi đổi máy, SĐT: 0988888888", "attacker_zalo_999", "Attacker");
        console.log("Case B result:", resB);

        if (!resB.handled) {
            throw new Error("Case B should be handled");
        }
        if (createLinkRequestCalled) {
            throw new Error("SECURITY FAILURE: createLinkRequest should NOT be called for an already bound phone!");
        }

        // ZERO INFORMATION DISCLOSURE TEST
        if (resB.replyText?.includes("302") || resB.replyText?.includes("Phan Bá Vành") || resB.replyText?.includes("Trần Thị B") || resB.replyText?.includes("38PBV")) {
            throw new Error(`CRITICAL SECURITY FAILURE: Zero Information Disclosure violated in Case B! Reply: ${resB.replyText}`);
        }
        if (resB.replyText !== "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.") {
            throw new Error(`Expected neutral reply message, got: ${resB.replyText}`);
        }
        console.log("✅ Case B passed: Anti-overwrite protection & Zero Information Disclosure verified!");

        // 4. Case C: Phone NOT matching any contract -> Guest flow NOT blocked
        console.log("\n--- 4. Testing Case C: Non-tenant phone (Unblocked guest) ---");
        createLinkRequestCalled = false;
        const resC = await handlePhoneClaim("Phòng còn trống không? SĐT tư vấn 0900000000", "guest_user_555");
        console.log("Case C result:", resC);

        if (resC.handled !== false) {
            throw new Error("Case C should return handled: false so guest flow is not blocked!");
        }
        if (createLinkRequestCalled) {
            throw new Error("Case C should not call createLinkRequest");
        }
        console.log("✅ Case C passed: Guest inquiry is not blocked!");

        // 5. Case D: Text without phone number -> Unblocked
        console.log("\n--- 5. Testing Case D: Text without phone ---");
        const resD = await handlePhoneClaim("Cho tôi hỏi giá phòng", "guest_user_555");
        if (resD.handled !== false) {
            throw new Error("Case D should return handled: false");
        }
        console.log("✅ Case D passed!");

        console.log("\n=======================================================");
        console.log("🎉 ALL TASK 2 TESTS PASSED SUCCESSFULLY!");
        console.log("=======================================================");
    } finally {
        // Restore
        (larkClient as any).getContractByPhone = origGetContractByPhone;
        (larkClient as any).createLinkRequest = origCreateLinkRequest;
    }
}

runTests().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
