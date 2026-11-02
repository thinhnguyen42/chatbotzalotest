import "dotenv/config";

/**
 * Cấu hình thông tin Admin & Hotline tòa nhà.
 * Dễ dàng thay đổi SĐT qua file .env (ADMIN_PHONE_NUMBER=0945234616)
 * hoặc sửa giá trị mặc định ở đây.
 */
export const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || "0945234616";
export const ADMIN_ZALO_USER_ID = process.env.ZALO_ADMIN_USER_ID || "";

/**
 * Danh sách toàn bộ Zalo User ID có quyền Admin / Ban Quản Lý
 */
export function getAdminUserIds(): string[] {
    const list = [
        "6962737755353011552",
        "4724202976037526351",
        ...(process.env.ADMIN_ZALO_USER_IDS || "").split(","),
        ...(process.env.ZALO_ADMIN_USER_ID || "").split(","),
        ...(process.env.PASSCODE_WHITELIST_USER_IDS || "").split(","),
        ADMIN_ZALO_USER_ID,
    ];
    return Array.from(new Set(list.map((s) => (s || "").trim()).filter(Boolean)));
}

/**
 * Kiểm tra một Zalo User ID có quyền Admin hay không
 */
export function isAdminUser(zaloUserId: string): boolean {
    if (!zaloUserId) return false;
    return getAdminUserIds().includes(zaloUserId.trim());
}
