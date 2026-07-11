import axios from "axios";
import { ZaloAuthService } from "./zalo-auth";

export class ZaloApiService {
  private static readonly BASE_URL = "https://openapi.zalo.me/v3.0/oa";

  /**
   * 1. Gửi tin nhắn văn bản CSKH cho người dùng theo UID
   * (Được trích xuất từ mô-đun zalooa-messaging)
   */
  static async sendTextMessage(uid: string, text: string): Promise<any> {
    const token = await ZaloAuthService.getAccessToken();
    const url = `${this.BASE_URL}/message/cs`;

    const payload = {
      recipient: { user_id: uid },
      message: { text: text },
    };

    const res = await axios.post(url, payload, {
      headers: { access_token: token },
    });
    return res.data;
  }

  /**
   * 2. Lấy thông tin chi tiết (Tên, Avatar) của khách hàng từ UID
   * (Được trích xuất từ mô-đun zalooa-user-management)
   */
  static async getUserProfile(uid: string): Promise<{ displayName: string; avatar: string }> {
    try {
      const token = await ZaloAuthService.getAccessToken();
      const res = await axios.get(`${this.BASE_URL}/user/detail`, {
        params: { data: JSON.stringify({ user_id: uid }) },
        headers: { access_token: token },
      });

      if (res.data?.data) {
        return {
          displayName: res.data.data.display_name || "Khách hàng",
          avatar: res.data.data.avatar || "",
        };
      }
    } catch (e) {
      console.warn("Không thể lấy profile UID:", uid);
    }
    return { displayName: "Khách hàng", avatar: "" };
  }
}