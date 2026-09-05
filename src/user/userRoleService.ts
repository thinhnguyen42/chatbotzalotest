import { ADMIN_ZALO_USER_ID } from "../config/adminConfig";
import { getContractByPhone, createLinkRequest } from "../lark/larkClient";
import { getSession, updateSessionContext } from "../memory/sessionMemory";

export type UserRole = "ADMIN" | "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" | "UNTAGGED_GUEST";

export interface UserRoleContext {
    zaloUserId: string;
    role: UserRole;
    tagCode?: string;
    roomNumber?: string;
    address?: string;
    tenantName?: string;
    phone?: string;
}

interface CachedRole {
    ctx: UserRoleContext;
    expiresAt: number;
}

const roleCache = new Map<string, CachedRole>();
const ROLE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút

export function setCachedRole(zaloUserId: string, ctx: UserRoleContext): void {
    roleCache.set(zaloUserId, {
        ctx,
        expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
    });
}

export function invalidateRoleCache(zaloUserId: string): void {
    roleCache.delete(zaloUserId);
}

/**
 * Trích xuất số điện thoại di động Việt Nam từ tin nhắn (10 số, đầu 03/05/07/08/09 hoặc +84)
 */
export function extractPhoneNumber(text: string): string | null {
    if (!text) return null;

    // Ưu tiên khớp dạng có nhãn: SĐT, SDT, phone, dt...
    const keywordMatch = text.match(/(?:sđt|sdt|dt|phone|dienthoai|so dien thoai)\s*:?\s*(\+?84|0)?([35789]\d{8})\b/i);
    if (keywordMatch) {
        return `0${keywordMatch[2]}`;
    }

    // Khớp dạng SĐT đứng riêng lẻ hoặc trong câu
    const standardMatch = text.match(/(?:\+?84|0)([35789]\d{8})\b/);
    if (standardMatch) {
        return `0${standardMatch[1]}`;
    }

    return null;
}

/**
 * Phân giải vai trò người dùng (ADMIN, PRIMARY_LEASEHOLDER, CO_RESIDENT, UNTAGGED_GUEST)
 */
export async function resolveUserRole(zaloUserId: string): Promise<UserRoleContext> {
    if (!zaloUserId) {
        return { zaloUserId: "", role: "UNTAGGED_GUEST" };
    }

    // 1. Kiểm tra Admin qua allowlist
    const adminIds = (process.env.ADMIN_ZALO_USER_IDS || ADMIN_ZALO_USER_ID || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    if (adminIds.includes(zaloUserId)) {
        return { zaloUserId, role: "ADMIN" };
    }

    // 2. Kiểm tra cache trong bộ nhớ
    const cached = roleCache.get(zaloUserId);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.ctx;
    }

    // 3. Kiểm tra thông tin trong session memory nếu đã bind
    const session = getSession(zaloUserId) as any;
    if (session && session.role && (session.role === "PRIMARY_LEASEHOLDER" || session.role === "CO_RESIDENT")) {
        const ctx: UserRoleContext = {
            zaloUserId,
            role: session.role,
            tagCode: session.tagCode,
            roomNumber: session.roomNumber,
            address: session.address,
            tenantName: session.userName,
            phone: session.phone,
        };
        setCachedRole(zaloUserId, ctx);
        return ctx;
    }

    // 4. Mặc định là khách chưa định danh
    return {
        zaloUserId,
        role: "UNTAGGED_GUEST",
    };
}

/**
 * Xử lý yêu cầu xác thực / liên kết SĐT cư dân (Task 2).
 * ĐẢM BẢO QUY TẮC BẢO MẬT: Zero Information Disclosure (Không tiết lộ số phòng/địa chỉ/tên).
 */
export async function handlePhoneClaim(
    userText: string,
    zaloUserId: string,
    zaloDisplayName?: string
): Promise<{ handled: boolean; replyText?: string }> {
    const phone = extractPhoneNumber(userText);
    if (!phone) {
        return { handled: false };
    }

    try {
        const contract = await getContractByPhone(phone);
        if (!contract) {
            // Không tìm thấy hồ sơ hợp đồng -> Trả về handled: false để không chặn luồng chat của khách
            return { handled: false };
        }

        // BẢO VỆ CHỐNG GHI ĐÈ: Nếu hợp đồng này đã được liên kết với một Zalo User ID khác
        if (contract.zaloUserId) {
            console.log(
                `[userRoleService] Cảnh báo: SĐT ${phone} đã được liên kết với Zalo UID ${contract.zaloUserId}. Từ chối yêu cầu từ ${zaloUserId}.`
            );
            // Vẫn trả lời bằng câu trung lập, không tiết lộ lý do chi tiết để tránh dò số điện thoại
            return {
                handled: true,
                replyText: "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.",
            };
        }

        // Chưa có Zalo User ID gắn -> Tạo yêu cầu liên kết mới vào bảng BOT_LINK_REQUESTS
        const ok = await createLinkRequest(
            phone,
            zaloUserId,
            zaloDisplayName || "",
            contract.recordId
        );

        if (ok) {
            console.log(
                `[userRoleService] Đã gửi yêu cầu liên kết cho SĐT ${phone} (Zalo UID: ${zaloUserId}) lên BOT_LINK_REQUESTS`
            );
        } else {
            console.warn(
                `[userRoleService] Không thể ghi yêu cầu liên kết vào BOT_LINK_REQUESTS cho SĐT ${phone}`
            );
        }

        // ZERO INFORMATION DISCLOSURE: Tuyệt đối không hé lộ số phòng, tên, hay địa chỉ của cư dân
        return {
            handled: true,
            replyText: "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.",
        };
    } catch (err: any) {
        console.error("[userRoleService] Lỗi trong handlePhoneClaim:", err.message);
        return { handled: false };
    }
}
