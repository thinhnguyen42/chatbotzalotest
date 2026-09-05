import { LinkRequestRecord, getContractByPhone, markLinkRequestAsProcessed } from "../lark/larkClient";
import { updateSessionContext } from "../memory/sessionMemory";
import { setCachedRole } from "./userRoleService";
import { sendTextMessage, setUserTagInZalo } from "../zaloClient";

// Set lưu các recordId đã xử lý trong tiến trình hiện tại để chống lặp
const processedLinkRecordIds = new Set<string>();

/**
 * Xử lý yêu cầu liên kết đã được Admin duyệt trên Lark Base (Task 4).
 * Kích hoạt quyền Cư dân chính thức, gửi thông báo kèm số phòng/địa chỉ và gán tag Zalo OA.
 */
export async function processApprovedLink(approvedReq: LinkRequestRecord): Promise<{ success: boolean; error?: string }> {
    if (!approvedReq || !approvedReq.recordId) {
        return { success: false, error: "Record không hợp lệ" };
    }

    // Chống xử lý 2 lần (Anti-duplicate processing)
    if (approvedReq.processedByBot || processedLinkRecordIds.has(approvedReq.recordId)) {
        console.log(`[linkApproval] Record ${approvedReq.recordId} đã được xử lý trước đó, bỏ qua.`);
        return { success: true };
    }

    try {
        // 1. Đọc lại thông tin hợp đồng gốc từ TENANTS
        const contract = await getContractByPhone(approvedReq.phone);
        if (!contract) {
            console.error(`[linkApproval] Không tìm thấy hợp đồng cho SĐT: ${approvedReq.phone}`);
            return { success: false, error: "Hồ sơ người thuê không tồn tại trong Lark Base" };
        }

        const zaloUserId = approvedReq.zaloUserId;
        const role = contract.role || "PRIMARY_LEASEHOLDER";
        const tagCode = contract.tagCode;
        const roomNumber = contract.roomNumber;
        const address = contract.address;
        const tenantName = contract.tenantName;

        // 2. Cập nhật Session & Cache vai trò cho User
        updateSessionContext(zaloUserId, {
            role,
            roomNumber,
            userName: tenantName,
            tagCode,
            address,
            phone: contract.phone,
        });

        setCachedRole(zaloUserId, {
            zaloUserId,
            role,
            tagCode,
            roomNumber,
            address,
            tenantName,
            phone: contract.phone,
        });

        console.log(`[linkApproval] Đã kích hoạt vai trò ${role} và tag [${tagCode}] cho user ${zaloUserId}`);

        // 3. Gửi thông báo Zalo cho cư dân (lúc này đã qua xác thực nên được phép nhắc số phòng)
        const tenantMsg = `🎉 Chúc mừng bạn! Ban quản lý đã xác thực hồ sơ cư dân thành công.\n\n🏠 Bạn đã được kích hoạt quyền Cư dân Phòng ${roomNumber} - ${address} (Mã định danh: ${tagCode}).\nQuản gia AI luôn sẵn sàng hỗ trợ các vấn đề sinh hoạt, tiền phòng và báo hỏng thiết bị ạ!`;
        try {
            await sendTextMessage(zaloUserId, tenantMsg);
        } catch (msgErr: any) {
            console.warn(`[linkApproval] Không thể gửi tin nhắn Zalo cho ${zaloUserId}:`, msgErr.message);
        }

        // 4. Đồng bộ Tag lên Zalo OA (NON-BLOCKING)
        setUserTagInZalo(zaloUserId, tagCode).catch((tagErr: any) => {
            console.warn(`[linkApproval] Cảnh báo lỗi đồng bộ Tag Zalo OA cho ${zaloUserId}:`, tagErr.message);
        });

        // 5. Đánh dấu record đã xử lý trên Lark Base (Đã xử lý bởi bot = true)
        const marked = await markLinkRequestAsProcessed(approvedReq.recordId);
        if (marked) {
            processedLinkRecordIds.add(approvedReq.recordId);
            console.log(`[linkApproval] Đã đánh dấu 'Đã xử lý bởi bot' cho record ${approvedReq.recordId}`);
        }

        return { success: true };
    } catch (err: any) {
        console.error(`[linkApproval] Lỗi xử lý link approval cho record ${approvedReq.recordId}:`, err.message);
        return { success: false, error: err.message };
    }
}
