import fs from "fs";
import path from "path";
import { ADMIN_ZALO_USER_ID } from "../config/adminConfig";
import { getContractByPhone, getContractByCccd, createLinkRequest, findApprovedLinkByZaloUserId, isLarkQuotaBlocked } from "../lark/larkClient";
import { getSession, updateSessionContext } from "../memory/sessionMemory";
import { isValidFullName, extractNameFromMessage, isNameMatch } from "./tenantCsvService";

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

    // 4. Nếu cache/session trống (ví dụ do server vừa restart), tra cứu trực tiếp trên Lark Base
    try {
        const contract = await findApprovedLinkByZaloUserId(zaloUserId);
        if (contract) {
            const ctx: UserRoleContext = {
                zaloUserId,
                role: contract.role,
                tagCode: contract.tagCode,
                roomNumber: contract.roomNumber,
                address: contract.address,
                tenantName: contract.tenantName,
                phone: contract.phone,
                cccd: contract.cccd,
            };
            setCachedRole(zaloUserId, ctx);
            updateSessionContext(zaloUserId, {
                role: contract.role,
                roomNumber: contract.roomNumber,
                userName: contract.tenantName,
                tagCode: contract.tagCode,
                address: contract.address,
                phone: contract.phone || contract.cccd,
            });
            console.log(`[userRoleService] Đã phục hồi vai trò cư dân từ Lark Base: ${contract.tenantName} (${contract.tagCode}) cho user ${zaloUserId}`);
            return ctx;
        }
    } catch (err: any) {
        console.warn("[userRoleService] Lỗi tra cứu vai trò từ Lark Base:", err.message);
    }

    // 5. Mặc định là khách chưa định danh - cache 1 giờ để tránh query lặp lại trên từng tin nhắn
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
 * Xử lý yêu cầu xác thực / liên kết CCCD cư dân.
 * ĐẢM BẢO QUY TẮC BẢO MẬT: Zero Information Disclosure (Không tiết lộ số phòng/địa chỉ/tên).
 */
export async function handleCccdClaim(
    userText: string,
    zaloUserId: string,
    zaloDisplayName?: string
): Promise<{ handled: boolean; replyText?: string }> {
    const cccd = extractCccd(userText);
    if (!cccd) {
        return { handled: false };
    }

    // 0. GATEKEEPER 2 YẾU TỐ: Bắt buộc phải có cả Họ Tên và Số CCCD trước khi gọi API Lark Base
    const session = getSession(zaloUserId) as any;
    let candidateName = extractNameFromMessage(userText, cccd);
    if (!candidateName && session?.pendingTenantVerification?.step === "AWAIT_NAME") {
        candidateName = userText.trim();
    }

    if (!isValidFullName(candidateName)) {
        console.log(`[userRoleService] 🛡️ Gatekeeper: Tin nhắn chứa CCCD ${cccd} nhưng chưa có Họ Tên hợp lệ ("${candidateName}"). Chặn gọi Lark API.`);
        return { handled: false };
    }

    // 1. KIỂM TRA RATE LIMIT (Giới hạn 15 phút mỗi user)
    const lastClaim = claimThrottleMap.get(zaloUserId);
    if (lastClaim && Date.now() - lastClaim < CLAIM_THROTTLE_MS) {
        const remainingMinutes = Math.ceil((CLAIM_THROTTLE_MS - (Date.now() - lastClaim)) / 60000);
        console.log(`[userRoleService] ⏳ User ${zaloUserId} gửi claim CCCD quá nhanh (còn ${remainingMinutes}p cooldown). Chặn gọi Lark API.`);
        return {
            handled: true,
            replyText: "Quản gia AI đã ghi nhận yêu cầu xác thực của bạn trước đó rồi ạ. Hồ sơ đang được Ban Quản lý xử lý, bạn vui lòng chờ nhé!",
        };
    }

    // 2. KIỂM TRA CACHE SỐ CCCD KHÔNG TỒN TẠI
    const unknownExp = unknownCccdCache.get(cccd);
    if (unknownExp && Date.now() < unknownExp) {
        console.log(`[userRoleService] ⏭️ CCCD ${cccd} đã xác định không tồn tại (cache). Bỏ qua gọi Lark.`);
        return { handled: false };
    }

    // 3. NẾU LARK BASE SYNC ĐANG TẮT HOẶC QUOTA BỊ KHÓA -> Trả lời xác nhận offline
    if (process.env.ENABLE_LARK_SYNC !== "true" || isLarkQuotaBlocked()) {
        claimThrottleMap.set(zaloUserId, Date.now());
        console.log(`[userRoleService] ℹ️ Lark Sync tắt hoặc Quota hết. Ghi nhận claim offline cho user ${zaloUserId}.`);
        return {
            handled: true,
            replyText: "Quản gia AI đã ghi nhận yêu cầu xác thực CCCD của bạn. Ban Quản lý sẽ kiểm tra hồ sơ và kích hoạt quyền cư dân sớm nhất nhé!",
        };
    }

    try {
        const contract = await getContractByCccd(cccd);
        if (!contract) {
            // Không tìm thấy hồ sơ CCCD -> Cache lại để không query lại số này
            unknownCccdCache.set(cccd, Date.now() + UNKNOWN_CCCD_TTL_MS);
            return { handled: false };
        }

        // BẢO VỆ ĐỐI SOÁT TÊN TRÊN LARK BASE: Chỉ tạo link request nếu Tên người dùng khớp với Hợp đồng
        if (!isNameMatch(candidateName, contract.tenantName)) {
            console.log(`[userRoleService] ⚠️ Họ tên cung cấp ("${candidateName}") không khớp với tên hợp đồng trên Lark ("${contract.tenantName}"). Từ chối tạo link request.`);
            return {
                handled: true,
                replyText: `⚠️ Họ và tên bạn cung cấp ("${candidateName}") chưa trùng khớp với tên trong hợp đồng của số CCCD ${cccd}.\n\nBạn vui lòng kiểm tra lại chính xác họ tên nhé!`,
            };
        }

        claimThrottleMap.set(zaloUserId, Date.now());

        // BẢO VỆ CHỐNG GHI ĐÈ: Nếu hồ sơ này đã được liên kết với một Zalo User ID khác
        if (contract.zaloUserId) {
            console.log(
                `[userRoleService] Cảnh báo: CCCD ${cccd} đã được liên kết với Zalo UID ${contract.zaloUserId}. Từ chối yêu cầu từ ${zaloUserId}.`
            );
            return {
                handled: true,
                replyText: "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.",
            };
        }

        // Chưa có Zalo User ID gắn -> Tạo yêu cầu liên kết mới vào bảng BOT_LINK_REQUESTS
        const ok = await createLinkRequest(
            cccd,
            zaloUserId,
            zaloDisplayName || "",
            contract.recordId
        );

        if (ok) {
            console.log(
                `[userRoleService] Đã gửi yêu cầu liên kết cho CCCD ${cccd} (Zalo UID: ${zaloUserId}) lên BOT_LINK_REQUESTS`
            );
        } else {
            console.warn(
                `[userRoleService] Không thể ghi yêu cầu liên kết vào BOT_LINK_REQUESTS cho CCCD ${cccd}`
            );
        }

        // ZERO INFORMATION DISCLOSURE: Tuyệt đối không hé lộ số phòng, tên, hay địa chỉ của cư dân
        return {
            handled: true,
            replyText: "Đã ghi nhận yêu cầu xác thực CCCD, vui lòng chờ Ban quản lý phê duyệt.",
        };
    } catch (err: any) {
        console.error("[userRoleService] Lỗi trong handleCccdClaim:", err.message);
        return { handled: false };
    }
}

/**
 * Xử lý yêu cầu xác thực / liên kết SĐT hoặc CCCD cư dân.
 * Ưu tiên nhận diện CCCD trước, sau đó tới SĐT.
 */
export async function handlePhoneClaim(
    userText: string,
    zaloUserId: string,
    zaloDisplayName?: string
): Promise<{ handled: boolean; replyText?: string }> {
    // 1. Kiểm tra CCCD trước
    const cccdRes = await handleCccdClaim(userText, zaloUserId, zaloDisplayName);
    if (cccdRes.handled) {
        return cccdRes;
    }

    // 2. Kiểm tra SĐT
    const phone = extractPhoneNumber(userText);
    if (!phone) {
        return { handled: false };
    }

    // 2.1 Kiểm tra Rate Limit cho SĐT
    const lastClaim = claimThrottleMap.get(zaloUserId);
    if (lastClaim && Date.now() - lastClaim < CLAIM_THROTTLE_MS) {
        console.log(`[userRoleService] ⏳ User ${zaloUserId} gửi claim SĐT quá nhanh. Chặn gọi Lark API.`);
        return {
            handled: true,
            replyText: "Quản gia AI đã ghi nhận yêu cầu xác thực của bạn trước đó rồi ạ. Hồ sơ đang được Ban Quản lý xử lý, bạn vui lòng chờ nhé!",
        };
    }

    // 2.2 Nếu Lark Sync tắt hoặc Quota hết -> Phản hồi offline
    if (process.env.ENABLE_LARK_SYNC !== "true" || isLarkQuotaBlocked()) {
        claimThrottleMap.set(zaloUserId, Date.now());
        return {
            handled: true,
            replyText: "Quản gia AI đã ghi nhận số điện thoại của bạn. Ban Quản lý sẽ đối soát và phê duyệt hồ sơ sớm nhất nhé!",
        };
    }

    try {
        const contract = await getContractByPhone(phone);
        if (!contract) {
            return { handled: false };
        }

        claimThrottleMap.set(zaloUserId, Date.now());

        if (contract.zaloUserId) {
            console.log(
                `[userRoleService] Cảnh báo: SĐT ${phone} đã được liên kết với Zalo UID ${contract.zaloUserId}. Từ chối yêu cầu từ ${zaloUserId}.`
            );
            return {
                handled: true,
                replyText: "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.",
            };
        }

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
        }

        return {
            handled: true,
            replyText: "Đã ghi nhận yêu cầu, vui lòng chờ Ban quản lý xác nhận.",
        };
    } catch (err: any) {
        console.error("[userRoleService] Lỗi trong handlePhoneClaim:", err.message);
        return { handled: false };
    }
}
