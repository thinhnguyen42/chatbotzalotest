import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export class ZaloAuthService {
  private static accessToken: string = "";
  private static expireAt: number = 0;
  private static refreshToken: string = process.env.ZALO_REFRESH_TOKEN || "";

  /**
   * Lấy Access Token hợp lệ (Tự động gọi API làm mới nếu sắp hết hạn)
   */
  static async getAccessToken(): Promise<string> {
    // Nếu token còn hạn (trừ hao 10 phút), dùng lại token cũ
    if (this.accessToken && Date.now() < this.expireAt) {
      return this.accessToken;
    }

    try {
      console.log("🔄 [ZALO AUTH] Access Token hết hạn. Đang xin cấp lại từ Refresh Token...");

      const response = await axios.post(
        "https://oauth.zaloapp.com/v4/oa/access_token",
        new URLSearchParams({
          refresh_token: this.refreshToken,
          app_id: process.env.ZALO_APP_ID || "",
          grant_type: "refresh_token",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            secret_key: process.env.ZALO_APP_SECRET || "",
          },
        }
      );

      const data = response.data;
      if (data.error) {
        throw new Error(`Lỗi Zalo OAuth: ${data.error_name} - ${data.error_description}`);
      }

      // Cập nhật Token mới vào bộ nhớ
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token; // Zalo cấp luôn Refresh token mới
      this.expireAt = Date.now() + (Number(data.expires_in) - 600) * 1000;

      console.log("[ZALO AUTH] Gia hạn Access Token thành công!");
      // TODO: Nếu chạy server thật lâu dài, bạn nên lưu process.env.ZALO_REFRESH_TOKEN mới này vào Lark Base hoặc Database
      return this.accessToken;
    } catch (error) {
      console.error("[ZALO AUTH ERROR]: Không thể gia hạn Token!", error);
      throw error;
    }
  }
}