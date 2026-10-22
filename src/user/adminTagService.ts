import { findActiveLinkByRoom, unbindLinkRequest } from "../lark/larkClient";
import { updateSessionContext } from "../memory/sessionMemory";
import { invalidateRoleCache } from "./userRoleService";
import { removeUserTagInZalo, sendTextMessage } from "../zaloClient";
import { removeVietnameseDiacritics } from "../utils/textUtils";
import { getLocalActiveLinks, saveLocalActiveLinks } from "./tenantCsvService";

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
        // 1. Kiểm tra trong bộ nhớ đệm active-links.json trước (Hoạt động offline, không cần Lark Base)
        const localLinks = getLocalActiveLinks();
        let matchedRecordKey: string | null = null;
        let activeLink: any = null;

        const cleanQuery = queryTarget.replace(/\D/g, "");
        for (const [key, item] of Object.entries(localLinks)) {
            const rNum = String(item.roomNumber || "").replace(/\D/g, "");
            const tag = String(item.tagCode || "").toLowerCase();
            const cccd = String(item.cccd || "").replace(/\D/g, "");
            const uid = String(item.zaloUserId || "");

            if (
                (cleanQuery && rNum === cleanQuery) ||
                tag === queryTarget.toLowerCase() ||
                (cleanQuery.length >= 9 && cccd === cleanQuery) ||
                uid === queryTarget
            ) {
                matchedRecordKey = key;
                activeLink = item;
                break;
            }
        }

        // 2. Nếu không tìm thấy trong local, thử tra cứu Lark Base nếu còn kết nối
        if (!activeLink) {
            try {
                activeLink = await findActiveLinkByRoom(queryTarget);
            } catch {}
        }

        if (!activeLink) {
            return {
                handled: true,
                replyText: `⚠️ Không tìm thấy tài khoản cư dân nào đang được liên kết với "${queryTarget}" trong hệ thống.`,
            };
        }

        const zaloUserId = activeLink.zaloUserId;
        const phone = activeLink.phone || activeLink.cccd || "";
        const tagCode = activeLink.tagCode;
        const tenantName = activeLink.tenantName || "Cư dân";
        const roomNumber = activeLink.roomNumber;
        const linkRecordId = activeLink.recordId || matchedRecordKey;

        // Xóa khỏi file active-links.json
        if (matchedRecordKey && localLinks[matchedRecordKey]) {
            delete localLinks[matchedRecordKey];
            saveLocalActiveLinks(localLinks);
        }

        // Gỡ nhãn trên Zalo OA (NON-BLOCKING)
        removeUserTagInZalo(zaloUserId, tagCode).catch((err) => {
            console.warn(`[adminTagService] Cảnh báo lỗi gỡ tag Zalo OA cho user ${zaloUserId}:`, err.message);
        });

        // Cập nhật trạng thái trong Lark Base nếu có record trên Lark
        if (linkRecordId && !linkRecordId.startsWith("csv_")) {
            unbindLinkRequest(linkRecordId).catch(() => {});
        }

        // Reset Session & Invalidate Role Cache
        updateSessionContext(zaloUserId, {
            role: "UNTAGGED_GUEST",
            roomNumber: undefined,
            tagCode: undefined,
        });
        invalidateRoleCache(zaloUserId);

        console.log(`[adminTagService] Đã hủy liên kết cư dân Phòng ${roomNumber} (Zalo UID: ${zaloUserId}, Tag: ${tagCode})`);

        // Gửi tin nhắn thông báo cho cư dân
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
