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

// Bảng báo sự cố (INCIDENT_REPORTS) - Thay bằng Table ID thực tế từ Lark Base
export const LARK_INCIDENTS_TABLE_ID = process.env.LARK_INCIDENTS_TABLE_ID || "REPLACE_WITH_YOUR_INCIDENT_TABLE_ID";

// Link form chia sẻ của Lark Base (Form View) - Báo sự cố / sửa chữa hư hỏng
export const LARK_INCIDENT_FORM_URL =
    process.env.LARK_INCIDENT_FORM_URL || "https://ijpibh6qudtm.jp.larksuite.com/share/base/form/shrjpLrDF4Oe3N0RZIybuBkLdPb";
export const LARK_INCIDENT_SHORT_URL =
    process.env.LARK_INCIDENT_SHORT_URL || LARK_INCIDENT_FORM_URL;

export interface ContractRecord {
    recordId: string;
    tenantName: string;
    cccd: string;
    phone?: string;
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
    cccd: string;
    phone?: string;
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

// Memory cache cho Lark Base để tối ưu số lần gọi API cho nhà trọ ~16 phòng
interface MemoryCache<T> {
    data: T;
    expiresAt: number;
}

let cachedTenants: MemoryCache<any[]> | null = null;
const TENANT_CACHE_TTL_MS = 60 * 60 * 1000; // 60 phút cache danh sách cư dân

let cachedLinkRequests: MemoryCache<any[]> | null = null;
const LINK_REQUEST_CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút cache danh sách yêu cầu liên kết

/**
 * Xóa cache bộ nhớ để ép buộc nạp mới từ Lark Base ở lần gọi tiếp theo
 * Được gọi khi có Webhook trigger từ Lark Base hoặc khi thêm/sửa yêu cầu liên kết
 */
export function invalidateTenantCache(): void {
    cachedTenants = null;
    cachedLinkRequests = null;
    console.log("[larkClient] 🔄 Đã làm mới cache Lark Base (Tenants & LinkRequests).");
}

/**
 * Lấy danh sách cư dân từ cache bộ nhớ (nếu còn hạn) hoặc gọi API Lark Base nạp lại
 */
export async function getCachedTenantRecords(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && cachedTenants && Date.now() < cachedTenants.expiresAt) {
        return cachedTenants.data;
    }
    const token = await getTenantAccessToken();
    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_TENANTS_TABLE_ID}/records`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: 100 },
        timeout: 10000,
    });
    const items = res.data?.data?.items || [];
    cachedTenants = {
        data: items,
        expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
    };
    console.log(`[larkClient] 📦 Đã nạp và lưu cache ${items.length} cư dân từ bảng TENANTS (TTL: 60 phút).`);
    return items;
}

/**
 * Lấy danh sách yêu cầu liên kết từ cache bộ nhớ hoặc gọi API Lark Base nạp lại
 */
export async function getCachedLinkRequestRecords(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && cachedLinkRequests && Date.now() < cachedLinkRequests.expiresAt) {
        return cachedLinkRequests.data;
    }
    const token = await getTenantAccessToken();
    const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: 100 },
        timeout: 10000,
    });
    const items = res.data?.data?.items || [];
    cachedLinkRequests = {
        data: items,
        expiresAt: Date.now() + LINK_REQUEST_CACHE_TTL_MS,
    };
    return items;
}

/**
 * Tra cứu thông tin cư dân theo Số CCCD từ bảng TENANTS.
 * Sử dụng bộ nhớ cache để giảm tối đa số lần gọi API Lark Base.
 */
export async function getContractByCccd(cccd: string): Promise<ContractRecord | null> {
    const cleanCccd = cccd.replace(/\D/g, "");
    if (!cleanCccd) return null;

    try {
        // 1. Đọc danh sách records từ cache bộ nhớ (0 API calls nếu đã nạp)
        const items = await getCachedTenantRecords();
        let matchedItem: any = null;

        for (const item of items) {
            const rawCccd = String(item.fields?.["Số CCCD"] || item.fields?.["CCCD"] || "").replace(/\D/g, "");
            if (rawCccd && rawCccd === cleanCccd) {
                matchedItem = item;
                break;
            }
        }

        if (!matchedItem) {
            return null;
        }

        const fields = matchedItem.fields || {};
        const tenantName = String(fields["Họ và tên cư dân"] || "");

        // Tách số phòng: fields["Mã phòng"] là mảng [{ text: "303" }] hoặc chuỗi "303" hoặc fields["Phòng thuê"]
        let rawRoom = "";
        const rawPhongField = fields["Mã phòng"] || fields["Phòng thuê"];
        if (Array.isArray(rawPhongField) && rawPhongField.length > 0) {
            rawRoom = String(rawPhongField[0]?.text || rawPhongField[0] || "");
        } else {
            rawRoom = String(rawPhongField || "");
        }

        let roomNumber = rawRoom;
        const roomMatch = rawRoom.match(/\d{3,4}/);
        if (roomMatch) {
            roomNumber = roomMatch[0];
        }

        // Tòa nhà: fields["Toà nhà"] là mảng [{ text: "38PBV" }] hoặc chuỗi
        let building = "38PBV";
        const rawToaNha = fields["Toà nhà"];
        if (Array.isArray(rawToaNha) && rawToaNha.length > 0) {
            building = String(rawToaNha[0]?.text || rawToaNha[0] || "38PBV");
        } else if (rawToaNha) {
            building = String(rawToaNha);
        }

        const vaiTro = String(fields["Vai trò"] || "");
        const role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" =
            (vaiTro === "Người ở cùng" || vaiTro === "Cùng lưu trú") ? "CO_RESIDENT" : "PRIMARY_LEASEHOLDER";

        const address = "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh";
        const validBuilding = (!building || building.trim().toUpperCase() === "TEST") ? "38PBV" : building.trim().toUpperCase();
        const tagCode = `${validBuilding}-${roomNumber}`;

        // 2. KIỂM TRA CHÉO BOT_LINK_REQUESTS qua cache: đã có Zalo UID nào được duyệt gắn vào tenant này chưa?
        let existingZaloUserId: string | undefined = undefined;
        try {
            const linkItems = await getCachedLinkRequestRecords();
            for (const linkItem of linkItems) {
                const linkFields = linkItem.fields || {};
                const status = String(linkFields["TRẠNG THÁI"] || "");
                const linkedTenants = linkFields["TENANTS"];
                const isLinked =
                    Array.isArray(linkedTenants) && linkedTenants.some((id: any) => id === matchedItem.record_id || id?.record_id === matchedItem.record_id);

                const itemCccd = String(linkFields["CCCD"] || linkFields["SDT"] || "").replace(/\D/g, "");
                if (status === "Đã duyệt" && (isLinked || itemCccd === cleanCccd)) {
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
            cccd: cleanCccd,
            phone: String(fields["Số điện thoại"] || ""),
            roomNumber,
            address,
            tagCode,
            role,
            zaloUserId: existingZaloUserId || undefined,
            startDate: fields["Ngày cư trú"] ? String(fields["Ngày cư trú"]) : fields["Ngày bắt đầu hợp đồng"],
            endDate: fields["Ngày hết hạn"] ? String(fields["Ngày hết hạn"]) : fields["Ngày hết hợp đồng"],
        };
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong getContractByCccd:", err.response?.data || err.message);
        return null;
    }
}

/**
 * Tra cứu thông tin hợp đồng / cư dân theo Số điện thoại hoặc CCCD từ bảng TENANTS.
 * Tận dụng cache bộ nhớ để giảm tối đa số lần gọi API Lark Base.
 */
export async function getContractByPhone(phoneOrCccd: string): Promise<ContractRecord | null> {
    const cleanId = phoneOrCccd.replace(/\D/g, "");
    if (!cleanId) return null;

    try {
        const items = await getCachedTenantRecords();
        for (const item of items) {
            const rawPhone = String(item.fields?.["Số điện thoại"] || "").replace(/\D/g, "");
            const rawCccd = String(item.fields?.["Số CCCD"] || item.fields?.["CCCD"] || "").replace(/\D/g, "");
            if ((rawPhone && rawPhone === cleanId) || (rawCccd && rawCccd === cleanId)) {
                return getContractByCccd(rawCccd || cleanId);
            }
        }
        return null;
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong getContractByPhone:", err.response?.data || err.message);
        return null;
    }
}

/**
 * Tạo yêu cầu liên kết mới trong bảng BOT_LINK_REQUESTS (ghi vào cột CCCD).
 * RÀNG BUỘC: CHỈ ghi vào bảng BOT_LINK_REQUESTS, tuyệt đối không ghi vào các bảng khác.
 */
export async function createLinkRequest(
    cccdOrPhone: string,
    zaloUserId: string,
    _zaloDisplayName: string,
    contractRecordId: string
): Promise<boolean> {
    const cleanId = cccdOrPhone.replace(/\D/g, "");
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
        const res = await axios.post(
            url,
            {
                fields: {
                    "CCCD": cleanId,
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
            console.log(`[larkClient] Đã tạo yêu cầu liên kết cho CCCD ${cleanId} (Zalo UID: ${zaloUserId})`);
            invalidateTenantCache();
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

                const cccdVal = String(fields["CCCD"] || fields["SDT"] || "").trim();
                approvedList.push({
                    recordId: item.record_id,
                    cccd: cccdVal,
                    phone: String(fields["SDT"] || cccdVal),
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
 * Đọc tất cả các bản ghi trong bảng BOT_LINK_REQUESTS trên Lark Base.
 * Trả về null nếu có lỗi mạng / timeout để tránh xóa nhầm dữ liệu.
 */
export async function getAllLinkRequests(): Promise<LinkRequestRecord[] | null> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BOT_LINK_REQUESTS_TABLE_ID}/records`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 100 },
            timeout: 15000,
        });

        if (res.data?.code !== 0) {
            console.error("[larkClient] Lark Base trả về lỗi trong getAllLinkRequests:", res.data);
            return null;
        }

        const items = res.data?.data?.items || [];
        const list: LinkRequestRecord[] = [];

        for (const item of items) {
            const fields = item.fields || {};
            const status = String(fields["TRẠNG THÁI"] || "").trim();
            const processedByBot = Boolean(fields["Đã xử lý bởi bot"]);

            const tenantLinks = fields["TENANTS"];
            let tenantRecordId = "";
            if (Array.isArray(tenantLinks) && tenantLinks.length > 0) {
                tenantRecordId = typeof tenantLinks[0] === "string" ? tenantLinks[0] : tenantLinks[0].record_id;
            }

            const cccdVal = String(fields["CCCD"] || fields["SDT"] || "").trim();
            list.push({
                recordId: item.record_id,
                cccd: cccdVal,
                phone: String(fields["SDT"] || cccdVal),
                zaloUserId: String(fields["ZALO USER ID"] || ""),
                tenantRecordId,
                status,
                processedByBot,
            });
        }

        return list;
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong getAllLinkRequests:", err.response?.data || err.message);
        return null;
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

        if (res.data?.code === 0) {
            invalidateTenantCache();
            return true;
        }
        return false;
    } catch (err: any) {
        console.error("[larkClient] Lỗi markLinkRequestAsProcessed:", err.response?.data || err.message);
        return false;
    }
}

/**
 * Tra cứu thông tin liên kết đang hoạt động theo số phòng từ BOT_LINK_REQUESTS.
 */
export async function findActiveLinkByRoom(query: string): Promise<{
    linkRecordId: string;
    zaloUserId: string;
    phone: string;
    tagCode: string;
    roomNumber: string;
    tenantName: string;
} | null> {
    const raw = (query || "").trim();
    if (!raw) return null;

    // Chuẩn hóa: Nếu là dạng tag "38PBV-601", lấy phần phòng phía sau dấu gạch nối
    let cleanRoom = raw.replace(/\D/g, "");
    if (raw.includes("-")) {
        const afterHyphen = raw.split("-").pop() || "";
        const roomOnly = afterHyphen.replace(/\D/g, "");
        if (roomOnly) cleanRoom = roomOnly;
    }

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
            const cccdOrPhone = String(fields["CCCD"] || fields["SDT"] || "").trim();
            const zaloUserId = String(fields["ZALO USER ID"] || "").trim();

            if (status === "Đã duyệt" && cccdOrPhone && zaloUserId) {
                const cleanQuery = raw.replace(/\D/g, "");
                const isCccdOrPhoneMatch = cleanQuery.length >= 9 && (cccdOrPhone === cleanQuery || cccdOrPhone.endsWith(cleanQuery));

                const contract = (await getContractByCccd(cccdOrPhone)) || (await getContractByPhone(cccdOrPhone));
                if (contract) {
                    const isRoomMatch = cleanRoom && (contract.roomNumber === cleanRoom || contract.tagCode.endsWith(`-${cleanRoom}`));
                    if (isCccdOrPhoneMatch || isRoomMatch) {
                        return {
                            linkRecordId: item.record_id,
                            zaloUserId,
                            phone: contract.phone || cccdOrPhone,
                            tagCode: contract.tagCode,
                            roomNumber: contract.roomNumber,
                            tenantName: contract.tenantName,
                        };
                    }
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
 * Tra cứu yêu cầu liên kết đã được Admin duyệt trên Lark Base theo Zalo User ID.
 * Dùng để phục hồi vai trò cư dân khi server khởi động lại (cache/session bị reset).
 */
export async function findApprovedLinkByZaloUserId(zaloUserId: string): Promise<ContractRecord | null> {
    if (!zaloUserId) return null;
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
            const uid = String(fields["ZALO USER ID"] || "").trim();

            if (status === "Đã duyệt" && uid === zaloUserId) {
                const cccd = String(fields["CCCD"] || fields["SDT"] || "").trim();
                const contract = (await getContractByCccd(cccd)) || (await getContractByPhone(cccd));
                if (contract) {
                    return contract;
                }
            }
        }

        return null;
    } catch (err: any) {
        console.error("[larkClient] Lỗi trong findApprovedLinkByZaloUserId:", err.response?.data || err.message);
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

        if (res.data?.code === 0) {
            invalidateTenantCache();
            return true;
        }
        return false;
    } catch (err: any) {
        console.error("[larkClient] Lỗi unbindLinkRequest:", err.response?.data || err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT REPORTS — Báo sự cố (INCIDENT_REPORTS table)
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentRecord {
    recordId: string;
    maCode: string;          // Mã sự cố (AA11...)
    toaNha: string;          // Tòa nhà (38PBV)
    soPhong: string;         // Số phòng
    loaiSuCo: string;        // Loại sự cố (Điện, Nước...)
    moTa: string;            // Mô tả chi tiết
    thoiGian?: string;       // Thời gian tạo
    trangThai: string;       // Trạng thái (Chờ xử lý / Đang xử lý / Đã xử lý)
    zaloUserId?: string;     // Zalo User ID người báo
    sdtLienHe?: string;      // SĐT liên hệ
    notifiedAdmin: boolean;  // Đã thông báo admin chưa
}

/**
 * Đọc các bản ghi sự cố mới chưa được thông báo cho admin
 */
export async function getNewIncidentRecords(): Promise<IncidentRecord[]> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_INCIDENTS_TABLE_ID}/records`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 100 },
            timeout: 15000,
        });

        const items = res.data?.data?.items || [];
        const newIncidents: IncidentRecord[] = [];

        for (const item of items) {
            const fields = item.fields || {};
            // Chỉ lấy các record chưa thông báo admin (field "Đã thông báo admin" = false hoặc chưa có)
            const notified = Boolean(fields["Đã thông báo admin"]);
            if (!notified) {
                newIncidents.push({
                    recordId: item.record_id,
                    maCode: String(fields["Mã sự cố"] || ""),
                    toaNha: String(fields["Tòa nhà"] || ""),
                    soPhong: String(fields["Số phòng"] || ""),
                    loaiSuCo: String(fields["Loại sự cố"] || ""),
                    moTa: String(fields["Mô tả"] || ""),
                    thoiGian: fields["Thời gian"] ? String(fields["Thời gian"]) : undefined,
                    trangThai: String(fields["Trạng thái"] || "Chờ xử lý"),
                    zaloUserId: String(fields["Zalo User ID"] || ""),
                    sdtLienHe: String(fields["SĐT liên hệ"] || ""),
                    notifiedAdmin: notified,
                });
            }
        }

        return newIncidents;
    } catch (err: any) {
        console.error("[larkClient] Lỗi getNewIncidentRecords:", err.response?.data || err.message);
        return [];
    }
}

/**
 * Đánh dấu record sự cố đã được thông báo cho admin
 */
export async function markIncidentNotified(recordId: string): Promise<boolean> {
    const token = await getTenantAccessToken();

    try {
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_INCIDENTS_TABLE_ID}/records/${recordId}`;
        const res = await axios.put(
            url,
            {
                fields: {
                    "Đã thông báo admin": true,
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
            invalidateTenantCache();
            return true;
        }
        return false;
    } catch (err: any) {
        console.error("[larkClient] Lỗi markIncidentNotified:", err.response?.data || err.message);
        return false;
    }
}
