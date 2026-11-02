import fs from "fs";
import path from "path";
import { ADMIN_ZALO_USER_ID } from "../config/adminConfig";
import { getSession, updateSessionContext } from "../memory/sessionMemory";
import { isValidFullName, extractNameFromMessage, isNameMatch, handleCsvTenantClaim, getCachedTenants } from "./tenantCsvService";

export type UserRole = "ADMIN" | "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" | "UNTAGGED_GUEST";

export interface UserRoleContext {
    zaloUserId: string;
    role: UserRole;
    tagCode?: string;
    roomNumber?: string;
    address?: string;
    tenantName?: string;
    phone?: string;
    cccd?: string;
}

interface CachedRole {
    ctx: UserRoleContext;
    expiresAt: number;
}

const roleCache = new Map<string, CachedRole>();
const ROLE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ
const GUEST_CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ cho UNTAGGED_GUEST để tránh gọi Lark lặp lại trên mỗi tin nhắn

// Bộ đệm giới hạn tần suất gửi yêu cầu xác thực CCCD/SĐT (15 phút mỗi user)
const claimThrottleMap = new Map<string, number>();
const CLAIM_THROTTLE_MS = 15 * 60 * 1000;

// Bộ nhớ đệm tra cứu CCCD không tồn tại (tránh query Lark liên tục cho số rác)
const unknownCccdCache = new Map<string, number>();
const UNKNOWN_CCCD_TTL_MS = 2 * 60 * 60 * 1000; // 2 giờ

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
 * Trích xuất số CCCD (12 chữ số) hoặc CMND (9 chữ số) từ tin nhắn.
 */
export function extractCccd(text: string): string | null {
    if (!text) return null;

    // Ưu tiên khớp dạng có nhãn: CCCD, CMND, căn cước, can cuoc, định danh...
    const keywordMatch = text.match(/(?:cccd|cmnd|căn cước|can cuoc|so cccd|so cmnd|dinh danh)\s*:?\s*(\d{9,12})\b/i);
    if (keywordMatch) {
        return keywordMatch[1];
    }

    // Khớp số CCCD 12 chữ số đứng độc lập hoặc trong câu
    const cccd12Match = text.match(/\b(\d{12})\b/);
    if (cccd12Match) {
        return cccd12Match[1];
    }

    // Khớp số CMND 9 chữ số nếu có từ khóa bổ trợ
    const cccd9Match = text.match(/\b(\d{9})\b/);
    if (cccd9Match && /(?:cccd|cmnd|căn cước|can cuoc|the|giay to)/i.test(text)) {
        return cccd9Match[1];
    }

    return null;
}

/**
 * Trích xuất số điện thoại di động Việt Nam từ tin nhắn (10 số, đầu 03/05/07/08/09 hoặc +84)
 */
export function extractPhoneNumber(text: string): string | null {
    if (!text) return null;

    // Ưu tiên khớp dạng có nhãn: SĐT, SDT, phone, dt...
    const keywordMatch = text.match(/(?:sđt|sdt|dt|phone|dienthoai|so dien thoai)\s*:?\s*(\+?84|0)?([1-9]\d{7,10})\b/i);
    if (keywordMatch) {
        const raw = keywordMatch[2];
        return raw.startsWith("0") ? raw : `0${raw}`;
    }

    // Khớp dạng SĐT đứng riêng lẻ hoặc trong câu
    const standardMatch = text.match(/(?:\+?84|0)([35789]\d{8,9})\b/);
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
    const adminIds = [
        "6962737755353011552",
        ...(process.env.ADMIN_ZALO_USER_IDS || "").split(","),
        ...(process.env.ZALO_ADMIN_USER_ID || "").split(","),
        ...(process.env.PASSCODE_WHITELIST_USER_IDS || "").split(","),
        ADMIN_ZALO_USER_ID,
    ]
        .map((s) => s.trim())
        .filter(Boolean);

    if (adminIds.includes(zaloUserId)) {
        return {
            zaloUserId,
            role: "ADMIN",
            tenantName: "Ban Quản Lý / Admin",
            roomNumber: "BQL",
            tagCode: "38PBV-ADMIN",
            address: "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh",
        };
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
            cccd: session.cccd,
        };
        setCachedRole(zaloUserId, ctx);
        return ctx;
    }

    // 3.5 Kiểm tra dữ liệu cư dân đã duyệt lưu trong data/active-links.json để phục hồi 0ms
    const activeLinksFile = path.resolve(process.cwd(), "data", "active-links.json");
    if (fs.existsSync(activeLinksFile)) {
        try {
            const raw = fs.readFileSync(activeLinksFile, "utf-8");
            const data = JSON.parse(raw);
            const found = Object.values(data).find((item: any) => item.zaloUserId === zaloUserId) as any;
            if (found) {
                const ctx: UserRoleContext = {
                    zaloUserId,
                    role: found.role || "PRIMARY_LEASEHOLDER",
                    tagCode: found.tagCode,
                    roomNumber: found.roomNumber,
                    address: found.address,
                    tenantName: found.tenantName,
                    phone: found.phone,
                };
                setCachedRole(zaloUserId, ctx);
                updateSessionContext(zaloUserId, {
                    role: ctx.role,
                    roomNumber: ctx.roomNumber,
                    userName: ctx.tenantName,
                    tagCode: ctx.tagCode,
                    address: ctx.address,
                    phone: ctx.phone,
                });
                console.log(`[userRoleService] ⚡ Phục hồi vai trò cư dân 0ms từ active-links.json: ${found.tenantName} (${found.roomNumber})`);
                return ctx;
            }
        } catch {}
    }

    // 4. Mặc định là khách chưa định danh - cache 1 giờ để tránh query lặp lại trên từng tin nhắn
    // 100% OFFLINE / ZERO LARK API CALLS: Dữ liệu cư dân vận hành độc lập qua CSV và active-links.json
    const guestCtx: UserRoleContext = {
        zaloUserId,
        role: "UNTAGGED_GUEST",
    };
    roleCache.set(zaloUserId, {
        ctx: guestCtx,
        expiresAt: Date.now() + GUEST_CACHE_TTL_MS,
    });
    return guestCtx;
}

/**
 * Xử lý yêu cầu xác thực / liên kết CCCD cư dân hoàn toàn Offline qua CSV.
 * Tuân thủ Gatekeeper 2 yếu tố (Họ tên + CCCD) và Zero Information Disclosure.
 */
export async function handleCccdClaim(
    userText: string,
    zaloUserId: string,
    _zaloDisplayName?: string
): Promise<{ handled: boolean; replyText?: string }> {
    const res = await handleCsvTenantClaim(userText, zaloUserId);
    return {
        handled: res.handled,
        replyText: res.replyText,
    };
}

/**
 * Xử lý yêu cầu xác thực / liên kết SĐT hoặc CCCD cư dân.
 * Ưu tiên nhận diện CCCD trước, sau đó tới SĐT qua CSV Offline (0 API calls).
 */
export async function handlePhoneClaim(
    userText: string,
    zaloUserId: string,
    _zaloDisplayName?: string
): Promise<{ handled: boolean; replyText?: string }> {
    // 1. Kiểm tra CCCD trước
    const cccdRes = await handleCccdClaim(userText, zaloUserId, _zaloDisplayName);
    if (cccdRes.handled) {
        return cccdRes;
    }

    // 2. Kiểm tra SĐT
    const phone = extractPhoneNumber(userText);
    if (!phone) {
        return { handled: false };
    }

    // Tra cứu trong danh bạ CSV Offline (0 API calls)
    const cleanPhone = phone.replace(/\D/g, "");
    const tenants = getCachedTenants();
    const matched = tenants.find((t) => (t.phone || "").replace(/\D/g, "") === cleanPhone);

    if (matched) {
        return {
            handled: true,
            replyText: `Dạ, Quản gia AI đã tìm thấy hồ sơ phòng ${matched.roomNumber} khớp với số điện thoại của bạn.\n\n🔒 Để đảm bảo an toàn và kích hoạt quyền cư dân tự động cấp mã mở cửa, bạn vui lòng gửi: **Họ và tên kèm số CCCD** (Ví dụ: "${matched.tenantName} ${matched.cccd.slice(0, 4)}...") nhé!`,
        };
    }

    return {
        handled: true,
        replyText: "Quản gia AI đã ghi nhận số điện thoại của bạn. Để kích hoạt quyền cư dân mở cửa tự động, bạn vui lòng gửi thêm Họ tên và số CCCD theo hợp đồng thuê phòng nhé!",
    };
}
