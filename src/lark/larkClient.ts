import axios from "axios";
import "dotenv/config";

// Configuration from environment variables
export const LARK_APP_ID = process.env.LARK_APP_ID || "cli_aa110d24dd385e18";
export const LARK_APP_SECRET = process.env.LARK_APP_SECRET || "XG8SN0U3lRPBskSpGQlHxgyzYBEiZ72y";
export const LARK_BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || "DLoyw8dASiH775kHdFUjj60epcd";

// Table IDs discovered from Bước 0
export const LARK_TENANTS_TABLE_ID = process.env.LARK_TENANTS_TABLE_ID || "tblwnuR8PTRExg2B";
export const LARK_CONTRACTS_TABLE_ID = process.env.LARK_CONTRACTS_TABLE_ID || "tbltA2AU1yDxLVvR";
export const LARK_BOT_LINK_REQUESTS_TABLE_ID = process.env.LARK_BOT_LINK_REQUESTS_TABLE_ID || "tbliWOdN1EkaYR4E";

export interface ContractRecord {
    recordId: string;
    tenantName: string;
    phone: string;
    roomNumber: string;
    address: string;
    tagCode: string;
    role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT";
    zaloUserId?: string;
    startDate?: string;
    endDate?: string;
}

export interface LinkRequestRecord {
    recordId: string;
    phone: string;
    zaloUserId: string;
    tenantRecordId: string;
    status: string;
    processedByBot: boolean;
}

// Token cache in memory
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getTenantAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    try {
        const res = await axios.post(
            "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
            {
                app_id: LARK_APP_ID,
                app_secret: LARK_APP_SECRET,
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
            }
        );

        if (res.data?.code !== 0) {
            throw new Error(`Lark auth failed: ${res.data?.msg || JSON.stringify(res.data)}`);
        }

        const token = res.data.tenant_access_token;
        const expireSeconds = res.data.expire || 7200;
        // Trừ 5 phút phòng ngừa lệch đồng hồ
        cachedToken = {
            token,
            expiresAt: Date.now() + (expireSeconds - 300) * 1000,
        };

        return token;
    } catch (err: any) {
        console.error("[larkClient] Lỗi lấy tenant_access_token:", err.response?.data || err.message);
        throw err;
    }
}

/**
 * Tra cứu thông tin hợp đồng / cư dân theo Số điện thoại từ bảng TENANTS.
 * RÀNG BUỘC: Chỉ ĐỌC (GET), không ghi/sửa bảng TENANTS.
 * Đồng thời kiểm tra chéo bảng BOT_LINK_REQUESTS để xem đã có Zalo UID nào được duyệt gắn vào chưa.
 */
export async function getContractByPhone(phone: string): Promise<ContractRecord | null> {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) return null;

    const token = await getTenantAccessToken();

    try {
        // 1. Đọc danh sách records từ bảng TENANTS
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_TENANTS_TABLE_ID}/records`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 100 },
            timeout: 10000,
        });

        const items = res.data?.data?.items || [];
        let matchedItem: any = null;

        for (const item of items) {
            const rawPhone = String(item.fields?.["Số điện thoại"] || "").replace(/\D/g, "");
            if (rawPhone && (rawPhone === cleanPhone || (rawPhone.length >= 9 && cleanPhone.length >= 9 && rawPhone.slice(-9) === cleanPhone.slice(-9)))) {
                matchedItem = item;
                break;
            }
        }

        if (!matchedItem) {
            return null;
        }

        const fields = matchedItem.fields || {};
        const tenantName = String(fields["Họ và tên cư dân"] || "");
        const rawRoomTag = String(fields["Phòng thuê"] || ""); // e.g. "38PBV-401" hoặc "401"
        const vaiTro = String(fields["Vai trò"] || "");
        const role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" =
            vaiTro === "Người ở cùng" ? "CO_RESIDENT" : "PRIMARY_LEASEHOLDER";

        // Tách số phòng từ mã tag (ví dụ: "38PBV-401" -> roomNumber "401")
        let roomNumber = rawRoomTag;
        const roomMatch = rawRoomTag.match(/\d{3,4}/);
        if (roomMatch) {
            roomNumber = roomMatch[0];
        }

        // Địa chỉ tòa nhà (mặc định 38 Phan Bá Vành theo cấu trúc tag 38PBV)
        const address = "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh";
        const tagCode = rawRoomTag.includes("-") ? rawRoomTag : `38PBV-${roomNumber}`;

        // 2. KIỂM TRA CHÉO BOT_LINK_REQUESTS: đã có Zalo UID nào được duyệt gắn vào tenant này chưa?
        let existingZaloUserId: string | undefined = undefined;
        try {
            const linkReqUrl = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
            const linkRes = await axios.get(linkReqUrl, {
                headers: { Authorization: `Bearer ${token}` },
                params: { page_size: 100 },
                timeout: 10000,
            });

            const linkItems = linkRes.data?.data?.items || [];
            for (const linkItem of linkItems) {
                const linkFields = linkItem.fields || {};
                const status = String(linkFields["TRẠNG THÁI"] || "");
                const linkedTenants = linkFields["TENANTS"]; // mảng recordId hoặc object
                const isLinked =
                    Array.isArray(linkedTenants) && linkedTenants.some((id: any) => id === matchedItem.record_id || id?.record_id === matchedItem.record_id);

                if (status === "Đã duyệt" && (isLinked || String(linkFields["SDT"]).replace(/\D/g, "") === cleanPhone)) {
                    existingZaloUserId = String(linkFields["ZALO USER ID"] || "");
                    break;
                }
            }
        } catch (e: any) {
            console.warn("[larkClient] Cảnh báo khi kiểm tra chéo link request:", e.message);
        }

        return {
            recordId: matchedItem.record_id,
            tenantName,
            phone: cleanPhone,
            roomNumber,
            address,
            tagCode,
            role,
            zaloUserId: existingZaloUserId || undefined,
            startDate: fields["Ngày bắt đầu hợp đồng"],
            endDate: fields["Ngày hết hợp đồng"],
        };
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong getContractByPhone:", err.response?.data || err.message);
        return null;
    }
}

/**
 * Tạo yêu cầu liên kết mới trong bảng BOT_LINK_REQUESTS.
 * RÀNG BUỘC: CHỈ ghi vào bảng BOT_LINK_REQUESTS, tuyệt đối không ghi vào các bảng khác.
 */
export async function createLinkRequest(
    phone: string,
    zaloUserId: string,
    _zaloDisplayName: string,
    contractRecordId: string
): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, "");
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
        const res = await axios.post(
            url,
            {
                fields: {
                    "SDT": cleanPhone,
                    "ZALO USER ID": zaloUserId,
                    "TENANTS": [contractRecordId],
                    "TRẠNG THÁI": "Chờ duyệt",
                    "Đã xử lý bởi bot": false,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        if (res.data?.code === 0) {
            console.log(`[larkClient] Đã tạo yêu cầu liên kết cho SĐT ${cleanPhone} (Zalo UID: ${zaloUserId})`);
            return true;
        }

        console.error("[larkClient] Lỗi tạo link request:", res.data);
        return false;
    } catch (err: any) {
        console.error("[larkClient] Lỗi API createLinkRequest:", err.response?.data || err.message);
        return false;
    }
}

/**
 * Đọc các yêu cầu liên kết đã được Admin duyệt trên Lark Base (TRẠNG THÁI = "Đã duyệt" và chưa xử lý).
 */
export async function getApprovedLinkRequests(_sinceTimestamp?: number): Promise<LinkRequestRecord[]> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 100 },
            timeout: 10000,
        });

        const items = res.data?.data?.items || [];
        const approvedList: LinkRequestRecord[] = [];

        for (const item of items) {
            const fields = item.fields || {};
            const status = String(fields["TRẠNG THÁI"] || "").trim();
            const processedByBot = Boolean(fields["Đã xử lý bởi bot"]);

            if (status === "Đã duyệt" && !processedByBot) {
                const tenantLinks = fields["TENANTS"];
                let tenantRecordId = "";
                if (Array.isArray(tenantLinks) && tenantLinks.length > 0) {
                    tenantRecordId = typeof tenantLinks[0] === "string" ? tenantLinks[0] : tenantLinks[0].record_id;
                }

                approvedList.push({
                    recordId: item.record_id,
                    phone: String(fields["SDT"] || ""),
                    zaloUserId: String(fields["ZALO USER ID"] || ""),
                    tenantRecordId,
                    status,
                    processedByBot,
                });
            }
        }

        return approvedList;
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong getApprovedLinkRequests:", err.response?.data || err.message);
        return [];
    }
}

/**
 * Đánh dấu yêu cầu liên kết đã được bot xử lý thành công (Đã xử lý bởi bot = true).
 */
export async function markLinkRequestAsProcessed(recordId: string): Promise<boolean> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records/${recordId}`;
        const res = await axios.put(
            url,
            {
                fields: {
                    "Đã xử lý bởi bot": true,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        return res.data?.code === 0;
    } catch (err: any) {
        console.error("[larkClient] Lỗi markLinkRequestAsProcessed:", err.response?.data || err.message);
        return false;
    }
}

/**
 * Tra cứu thông tin liên kết đang hoạt động theo số phòng từ BOT_LINK_REQUESTS.
 */
export async function findActiveLinkByRoom(roomNumber: string): Promise<{
    linkRecordId: string;
    zaloUserId: string;
    phone: string;
    tagCode: string;
    roomNumber: string;
    tenantName: string;
} | null> {
    const cleanRoom = roomNumber.replace(/\D/g, "");
    if (!cleanRoom) return null;

    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 100 },
            timeout: 10000,
        });

        const items = res.data?.data?.items || [];
        for (const item of items) {
            const fields = item.fields || {};
            const status = String(fields["TRẠNG THÁI"] || "").trim();
            const phone = String(fields["SDT"] || "").replace(/\D/g, "");
            const zaloUserId = String(fields["ZALO USER ID"] || "").trim();

            if (status === "Đã duyệt" && phone && zaloUserId) {
                const contract = await getContractByPhone(phone);
                if (contract && (contract.roomNumber === cleanRoom || contract.tagCode.endsWith(`-${cleanRoom}`))) {
                    return {
                        linkRecordId: item.record_id,
                        zaloUserId,
                        phone,
                        tagCode: contract.tagCode,
                        roomNumber: contract.roomNumber,
                        tenantName: contract.tenantName,
                    };
                }
            }
        }

        return null;
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong findActiveLinkByRoom:", err.response?.data || err.message);
        return null;
    }
}

/**
 * Hủy liên kết của cư dân trong bảng BOT_LINK_REQUESTS (chuyển TRẠNG THÁI = "Từ chối").
 * RÀNG BUỘC: CHỈ ghi/sửa trong bảng BOT_LINK_REQUESTS, không đụng vào bảng khác.
 */
export async function unbindLinkRequest(linkRecordId: string): Promise<boolean> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records/${linkRecordId}`;
        const res = await axios.put(
            url,
            {
                fields: {
                    "TRẠNG THÁI": "Từ chối",
                    "Đã xử lý bởi bot": true,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        return res.data?.code === 0;
    } catch (err: any) {
        console.error("[larkClient] Lỗi unbindLinkRequest:", err.response?.data || err.message);
        return false;
    }
}
