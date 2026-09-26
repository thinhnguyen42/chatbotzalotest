import { findActiveLinkByRoom, unbindLinkRequest } from "../lark/larkClient";
import { updateSessionContext } from "../memory/sessionMemory";
import { invalidateRoleCache } from "./userRoleService";
import { removeUserTagInZalo, sendTextMessage } from "../zaloClient";
import { removeVietnameseDiacritics } from "../utils/textUtils";

/**
 * Xử lý yêu cầu Admin gỡ Tag cư dân (ví dụ: "Toi muon go tag phong 101 nay", "gỡ tag phòng 101", "xóa tag 101").
 */
export async function handleAdminRemoveTag(
    userText: string,
    _adminUserId: string
): Promise<{ handled: boolean; replyText?: string }> {
    const norm = removeVietnameseDiacritics(userText.toLowerCase());

    // Nhận diện các dạng:
    // - "go tag phong 101", "gỡ tag phòng 101", "xóa tag 101", "gỡ tag 38PBV-601"
    // - "toi muon go tag phong 101 nay", "gỡ tag 082205011416"
    // - "go phong 101 tag", "tag phong 101 nay go di"
    const match =
        norm.match(/(?:go|xoa|huy)\s+tag\s+(?:phong|p\.?)?\s*([a-z0-9-]+)/i) ||
        norm.match(/(?:go|xoa|huy)\s+(?:phong|p\.?)?\s*([a-z0-9-]+)\s+tag/i) ||
        norm.match(/tag\s+(?:phong|p\.?)?\s*([a-z0-9-]+)\s+(?:nay\s+)?(?:go|xoa|huy)/i);

    if (!match || !match[1]) {
        return { handled: false };
    }

    const queryTarget = match[1];

    try {
        const activeLink = await findActiveLinkByRoom(queryTarget);
        if (!activeLink) {
            return {
                handled: true,
                replyText: `⚠️ Không tìm thấy tài khoản cư dân nào đang được liên kết với "${queryTarget}" trong hệ thống.`,
            };
        }

        const { linkRecordId, zaloUserId, phone, tagCode, tenantName, roomNumber } = activeLink;

        // 1. Gỡ nhãn trên Zalo OA (NON-BLOCKING)
        removeUserTagInZalo(zaloUserId, tagCode).catch((err) => {
            console.warn(`[adminTagService] Cảnh báo lỗi gỡ tag Zalo OA cho user ${zaloUserId}:`, err.message);
        });

        // 2. Cập nhật trạng thái trong bảng BOT_LINK_REQUESTS (TRẠNG THÁI = "Từ chối")
        await unbindLinkRequest(linkRecordId);

        // 3. Reset Session & Invalidate Role Cache
        updateSessionContext(zaloUserId, {
            role: "UNTAGGED_GUEST",
            roomNumber: undefined,
            tagCode: undefined,
        });
        invalidateRoleCache(zaloUserId);

        console.log(`[adminTagService] Đã hủy liên kết cư dân Phòng ${roomNumber} (Zalo UID: ${zaloUserId}, Tag: ${tagCode})`);

        // 4. Gửi tin nhắn thông báo cho cư dân
        const tenantMsg = `Thông báo từ Ban quản lý: Tài khoản Zalo của bạn đã được hủy liên kết quyền Cư dân Phòng ${roomNumber} (Mã định danh: ${tagCode}).\nNếu cần hỗ trợ thêm, bạn vui lòng liên hệ Ban quản lý tòa nhà nhé!`;
        sendTextMessage(zaloUserId, tenantMsg).catch((err) => {
            console.warn(`[adminTagService] Không thể gửi tin nhắn thông báo tới ${zaloUserId}:`, err.message);
        });

        return {
            handled: true,
            replyText: `✅ Đã gỡ thành công tag [${tagCode}] cho cư dân Phòng ${roomNumber} (Người thuê: ${tenantName}, CCCD/SĐT: ${phone}, Zalo UID: ${zaloUserId}).`,
        };
    } catch (err: any) {
        console.error("[adminTagService] Lỗi khi xử lý gỡ tag:", err.message);
        return {
            handled: true,
            replyText: `❌ Đã xảy ra lỗi khi gỡ tag: ${err.message}`,
        };
    }
}
