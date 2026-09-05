import * as larkClient from "../src/lark/larkClient";
import { generateReplyWithButtons } from "../src/replyEngine";
import { clearSession } from "../src/memory/sessionMemory";

async function runReplyEngineTests() {
    console.log("=== RUNNING TEST: ReplyEngine with Phone Claim Integration ===");

    const origGetContract = larkClient.getContractByPhone;
    const origCreateLink = larkClient.createLinkRequest;

    try {
        clearSession("test_guest_1");
        clearSession("test_guest_2");
        clearSession("test_guest_3");

        // 1. Guest claims phone matching unbound contract
        (larkClient as any).getContractByPhone = async (phone: string) => {
            if (phone === "0933445566") {
                return {
                    recordId: "rec_tenant_888",
                    tenantName: "Hoàng Văn H",
                    phone: "0933445566",
                    roomNumber: "502",
                    address: "38 Phan Bá Vành",
                    tagCode: "38PBV-502",
                    role: "PRIMARY_LEASEHOLDER",
                };
            }
            return null;
        };

        let linkCreated = false;
        (larkClient as any).createLinkRequest = async () => {
            linkCreated = true;
            return true;
        };

        const res1 = await generateReplyWithButtons("Em là người thuê mới, SĐT của em: 0933445566", "test_guest_1");
        console.log("ReplyEngine claim response:", res1.replyText);

        if (!linkCreated) {
            throw new Error("Expected createLinkRequest to be called in ReplyEngine");
        }
        if (res1.replyText !== "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.") {
            throw new Error(`Expected neutral reply, got: ${res1.replyText}`);
        }
        if (res1.replyText.includes("502") || res1.replyText.includes("Phan Bá Vành") || res1.replyText.includes("Hoàng")) {
            throw new Error("CRITICAL SECURITY VIOLATION: Zero Information Disclosure breached in ReplyEngine!");
        }
        console.log("✅ ReplyEngine phone claim test PASSED!");

        // 2. Normal guest message without contract phone -> NOT blocked, gets normal FAQ / RAG reply
        const res2 = await generateReplyWithButtons("Bên mình giờ mở cửa thế nào ạ?", "test_guest_2");
        console.log("ReplyEngine FAQ response:", res2.replyText);
        if (!res2.replyText.includes("8:00 - 21:00")) {
            throw new Error(`Expected FAQ response, got: ${res2.replyText}`);
        }
        console.log("✅ ReplyEngine unblocked guest flow test PASSED!");

    } finally {
        (larkClient as any).getContractByPhone = origGetContract;
        (larkClient as any).createLinkRequest = origCreateLink;
    }
}

runReplyEngineTests().catch((err) => {
    console.error("❌ ReplyEngine test failed:", err);
    process.exit(1);
});
