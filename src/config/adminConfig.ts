import "dotenv/config";

/**
 * Cấu hình thông tin Admin & Hotline tòa nhà.
 * Dễ dàng thay đổi SĐT qua file .env (ADMIN_PHONE_NUMBER=0945234616)
 * hoặc sửa giá trị mặc định ở đây.
 */
export const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || "0945234616";
export const ADMIN_ZALO_USER_ID = process.env.ZALO_ADMIN_USER_ID || "";
