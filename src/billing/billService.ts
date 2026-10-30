import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { getTenantAccessToken, LARK_BASE_APP_TOKEN, isLarkQuotaBlocked, recordLarkQuotaExceeded } from "../lark/larkClient";
import { getLocalActiveLinks } from "../user/tenantCsvService";
import { sendQuickReplies, uploadLocalImageToZalo, sendAttachmentImage } from "../zaloClient";
import "dotenv/config";

// Cấu hình bảng BILLS trên Lark Base
// Link: https://ijpibh6qudtm.jp.larksuite.com/wiki/DLoyw8dASiH775kHdFUjj60epcd?table=tbli1d2mSqMo6oJa&view=vewi8vB86w
export const LARK_BILLS_TABLE_ID = process.env.LARK_BILLS_TABLE_ID || "tbli1d2mSqMo6oJa";
export const LARK_BILLS_VIEW_ID = process.env.LARK_BILLS_VIEW_ID || "vewi8vB86w";

export const MONTHLY_BILLS_CACHE_FILE = path.resolve(process.cwd(), "data", "monthly-bills-cache.json");

export interface BillRecord {
    recordId: string;
    maHoaDon: string;
    roomNumber: string;
    building: string;
    tenantName: string;
    contractCode?: string;
    phone?: string;
    rentAmount: number;
    electricityKwh: number;
    electricityAmount: number;
    waterAmount: number;
    serviceAmount: number;
    otherFee?: number;
    previousDebt?: number;
    discount?: number;
    totalAmount: number;
    billingPeriod?: string;
    dueDate?: string;
    status: string;
    billImageUrl?: string;
    qrImageUrl?: string;
    qrString?: string;
    qrAttachmentId?: string;
    billAttachmentId?: string;
}

export interface MonthlyBillsCache {
    monthKey: string;     // Dạng "YYYY-MM", ví dụ "2026-10" hoặc "2026-11"
    fetchedAt: string;
    totalRecords: number;
    bills: BillRecord[];
}

/**
 * Tải cache danh sách hóa đơn từ đĩa
 */
export function loadMonthlyBillsCache(): MonthlyBillsCache | null {
    try {
        if (fs.existsSync(MONTHLY_BILLS_CACHE_FILE)) {
            const raw = fs.readFileSync(MONTHLY_BILLS_CACHE_FILE, "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.bills)) {
                return parsed as MonthlyBillsCache;
            }
        }
    } catch (err: any) {
        console.warn("[billService] Không thể đọc file monthly-bills-cache.json:", err.message);
    }
    return null;
}

/**
 * Lưu cache danh sách hóa đơn xuống đĩa (0 API calls cho các lần đọc tiếp theo trong tháng)
 */
export function saveMonthlyBillsCache(cache: MonthlyBillsCache): void {
    try {
        const dir = path.dirname(MONTHLY_BILLS_CACHE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(MONTHLY_BILLS_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
        console.log(`[billService] 💾 Đã lưu persistent cache ${cache.bills.length} hóa đơn tháng ${cache.monthKey} vào đĩa.`);
    } catch (err: any) {
        console.error("[billService] Lỗi khi lưu file monthly-bills-cache.json:", err.message);
    }
}

/**
 * Trả về danh sách Zalo UID trong Whitelist (Tester + Admin)
 */
export function getWhitelistRecipients(): string[] {
    const list = [
        process.env.ZALO_ADMIN_USER_ID,
        ...(process.env.PASSCODE_WHITELIST_USER_IDS || "").split(","),
        "6962737755353011552",
        "4724202976037526351",
    ];
    return Array.from(new Set(list.map((s) => (s || "").trim()).filter(Boolean)));
}

/**
 * Tìm Zalo User ID của cư dân phòng tương ứng từ active-links
 */
export function findZaloUserByRoom(roomNumber: string): string | null {
    if (!roomNumber) return null;
    const cleanTarget = String(roomNumber).replace(/\D/g, "");
    const links = getLocalActiveLinks();

    for (const [uid, info] of Object.entries(links)) {
        const r = String((info as any)?.roomNumber || "").replace(/\D/g, "");
        if (r && r === cleanTarget) {
            return uid;
        }
    }
    return null;
}

/**
 * Tạo ảnh VietQR chuẩn NAPAS qua API v2 và upload lên Zalo OA CDN
 */
export async function generateAndUploadVietQr(params: {
    amount: number;
    roomNumber: string;
    monthStr?: string;
}): Promise<string | null> {
    try {
        const month = params.monthStr || `${new Date().getMonth() + 1}`;
        const accountNo = process.env.VIETQR_ACCOUNT_NO || "0945234616";
        const accountName = process.env.VIETQR_ACCOUNT_NAME || "SUNHAVENS";
        const acqId = process.env.VIETQR_ACQ_ID || "970422"; // MBBank
        const addInfo = `TIEN PHONG ${params.roomNumber} T${month}`;

        console.log(`[billService] 💳 Tạo ảnh VietQR: ${accountNo} (${accountName}) - Số tiền: ${params.amount} đ`);

        const qrRes = await axios.post(
            "https://api.vietqr.io/v2/generate",
            {
                accountNo,
                accountName,
                acqId,
                amount: Math.round(params.amount),
                addInfo,
                format: "text",
                template: "compact2",
            },
            { timeout: 8000 }
        );

        const qrDataUrl = qrRes.data?.data?.qrDataURL;
        if (!qrDataUrl) {
            console.warn("[billService] VietQR API không trả về qrDataURL:", qrRes.data);
            return null;
        }

        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
        const tempPath = path.join(os.tmpdir(), `vietqr_${params.roomNumber}_${Date.now()}.png`);
        fs.writeFileSync(tempPath, Buffer.from(base64Data, "base64"));

        const attachmentId = await uploadLocalImageToZalo(tempPath);
        try { fs.unlinkSync(tempPath); } catch {}
        return attachmentId;
    } catch (err: any) {
        console.error("[billService] Lỗi tạo và upload VietQR:", err.message);
        return null;
    }
}

/**
 * Tải ảnh từ URL (ví dụ từ Lark Base attachment) và upload lên Zalo OA CDN
 */
export async function downloadAndUploadToZalo(imageUrl: string): Promise<string | null> {
    try {
        const resp = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 10000 });
        const ext = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "jpg" : "png";
        const tempPath = path.join(os.tmpdir(), `bill_img_${Date.now()}.${ext}`);
        fs.writeFileSync(tempPath, Buffer.from(resp.data));

        const attachmentId = await uploadLocalImageToZalo(tempPath);
        try { fs.unlinkSync(tempPath); } catch {}
        return attachmentId;
    } catch (err: any) {
        console.error("[billService] Lỗi tải ảnh từ URL và upload lên Zalo:", err.message);
        return null;
    }
}

/**
 * Định dạng tin nhắn gửi cho cư dân
 */
export function formatBillNotification(bill: BillRecord): string {
    const num = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n || 0));

    const lines = [
        `🔔 THÔNG BÁO TIỀN PHÒNG & DỊCH VỤ`,
        `🏢 Tòa nhà: ${bill.building || "38PBV"} - Phòng: ${bill.roomNumber}`,
        `👤 Cư dân: ${bill.tenantName || "Quý cư dân"}`,
        `━━━━━━━━━━━━━━━━━━`,
        `• Tiền phòng: ${num(bill.rentAmount)} đ`,
    ];

    if (bill.electricityAmount) {
        lines.push(`• Tiền điện (${bill.electricityKwh || 0} kWh): ${num(bill.electricityAmount)} đ`);
    }
    if (bill.waterAmount) {
        lines.push(`• Tiền nước: ${num(bill.waterAmount)} đ`);
    }
    if (bill.serviceAmount) {
        lines.push(`• Phí dịch vụ: ${num(bill.serviceAmount)} đ`);
    }
    if (bill.otherFee) {
        lines.push(`• Phí phát sinh: ${num(bill.otherFee)} đ`);
    }
    if (bill.discount) {
        lines.push(`• Giảm trừ: -${num(bill.discount)} đ`);
    }
    if (bill.previousDebt) {
        lines.push(`• Nợ tháng trước: ${num(bill.previousDebt)} đ`);
    }

    lines.push(
        `━━━━━━━━━━━━━━━━━━`,
        `💰 TỔNG CỘNG THANH TOÁN: ${num(bill.totalAmount)} đ`,
        bill.billingPeriod ? `📅 Kỳ thanh toán: ${bill.billingPeriod}` : `📅 Kỳ thanh toán: Tháng ${new Date().getMonth() + 1}`,
        bill.dueDate ? `⏰ Hạn thanh toán: Trước ngày ${bill.dueDate}` : `⏰ Hạn thanh toán: Trước ngày 05 hàng tháng`
    );

    return lines.join("\n");
}

/**
 * Quét danh sách hóa đơn từ bảng BILLS trên Lark Base.
 * TỐI ƯU HÓA: Chỉ gọi Lark Base API 1 lần duy nhất vào đầu tháng.
 * Mọi lần đọc sau đều lấy từ persistent cache trên đĩa (0 API calls).
 */
export async function fetchBillsFromLark(forceRefresh = false): Promise<BillRecord[]> {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 1. Kiểm tra cache trên đĩa (0 API calls nếu không ép buộc làm mới)
    const existingCache = loadMonthlyBillsCache();
    if (!forceRefresh && existingCache && existingCache.monthKey === currentMonthKey && existingCache.bills.length > 0) {
        console.log(`[billService] 📁 Đã nạp ${existingCache.bills.length} hóa đơn từ cache tháng ${currentMonthKey} (0 Lark API calls).`);
        return existingCache.bills;
    }

    // 2. Nếu quota Lark Base đang bị khóa bởi Circuit Breaker -> Dùng cache local
    if (isLarkQuotaBlocked()) {
        console.warn(`[billService] ⚠️ Lark Quota đang bị khóa (Circuit Breaker). Dùng cache local thay vì gọi API.`);
        if (existingCache && existingCache.bills.length > 0) {
            return existingCache.bills;
        }
        return [];
    }

    // 3. Gọi API Lark Base (chỉ diễn ra 1 lần vào đầu tháng hoặc khi Admin ép buộc refresh)
    try {
        console.log(`[billService] 🌐 Đang gọi Lark Base API để lấy hóa đơn tháng ${currentMonthKey}...`);
        const token = await getTenantAccessToken();
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BILLS_TABLE_ID}/records`;

        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                view_id: LARK_BILLS_VIEW_ID,
                page_size: 100,
            },
            timeout: 15000,
        });

        const data = res.data;
        if (data?.code === 99991403) {
            recordLarkQuotaExceeded(data?.msg);
            if (existingCache && existingCache.bills.length > 0) {
                return existingCache.bills;
            }
            return [];
        }

        if (data?.code !== 0) {
            console.warn(`[billService] Lark API trả về code ${data?.code}: ${data?.msg}`);
            if (existingCache && existingCache.bills.length > 0) {
                return existingCache.bills;
            }
            return [];
        }

        const items = data.data?.items || [];
        const bills: BillRecord[] = [];

        for (const item of items) {
            const f = item.fields || {};

            // Xử lý attachment Bill và QR
            const billAtt = Array.isArray(f["Bill"]) ? f["Bill"][0] : null;
            const qrAtt = Array.isArray(f["Mã QR"]) ? f["Mã QR"][0] : (Array.isArray(f["VietQR"]) ? f["VietQR"][0] : null);

            // Xử lý phòng (hỗ trợ cả "Phòng" và "Mã phòng")
            let room = String(f["Phòng"] || f["Mã phòng"] || "");
            if (Array.isArray(f["Phòng"])) {
                room = f["Phòng"][0]?.text || String(f["Phòng"][0]);
            } else if (Array.isArray(f["Mã phòng"])) {
                room = f["Mã phòng"][0]?.text || String(f["Mã phòng"][0]);
            }

            // Xử lý tòa nhà
            let building = String(f["Toà nhà"] || "38PBV");
            if (Array.isArray(f["Toà nhà"])) {
                building = f["Toà nhà"][0]?.text || String(f["Toà nhà"][0]);
            }

            const tenantName = String(f["Tên khách thuê"] || f["Tên chủ hộ"] || "");
            const contractCode = String(f["Hợp đồng"] || f["Mã hợp đồng"] || "");
            const phone = String(f["Số điện thoại"] || "");
            const rentAmount = Number(f["Tiền phòng (VNĐ)"]) || Number(f["Tiền phòng"]) || 0;
            const electricityKwh = Number(f["Điện tiêu thụ (kWh)"]) || Number(f["Điện tiêu thụ"]) || 0;
            const electricityAmount = Number(f["Tiền điện (VNĐ)"]) || Number(f["Tổng tiền điện"]) || 0;
            const waterAmount = Number(f["Tiền nước (VNĐ)"]) || Number(f["Tiền nước"]) || 0;
            const serviceAmount = Number(f["Phí dịch vụ (VNĐ)"]) || Number(f["Phí dịch vụ"]) || 0;
            const otherFee = Number(f["Phí phát sinh khác"]) || Number(f["Phí phát sinh"]) || 0;
            const previousDebt = Number(f["Nợ tháng trước (VNĐ)"]) || Number(f["Nợ tháng trước"]) || 0;
            const discount = Number(f["Giảm"]) || 0;
            const totalAmount = Number(f["TỔNG TIỀN PHẢI THU"]) || Number(f["Tổng thanh toán"]) || (rentAmount + electricityAmount + waterAmount + serviceAmount + otherFee + previousDebt);
            const billingPeriod = String(f["Kỳ thu"] || (f["Thanh toán từ"] && f["Thanh toán đến"] ? `${f["Thanh toán từ"]} - ${f["Thanh toán đến"]}` : `Tháng ${now.getMonth() + 1}`));
            const dueDate = f["Hạn thanh toán"] ? String(f["Hạn thanh toán"]) : "05";
            const status = String(f["Trạng thái thu tiền"] || f["Trạng thái"] || "Chờ gửi");

            bills.push({
                recordId: item.record_id,
                maHoaDon: String(f["Mã hóa đơn"] || `HD_${building}_${room}_${now.getMonth() + 1}${now.getFullYear()}`),
                roomNumber: room,
                building,
                tenantName,
                contractCode,
                phone,
                rentAmount,
                electricityKwh,
                electricityAmount,
                waterAmount,
                serviceAmount,
                otherFee,
                previousDebt,
                discount,
                totalAmount,
                billingPeriod,
                dueDate,
                status,
                billImageUrl: billAtt?.tmp_url || billAtt?.url,
                qrImageUrl: qrAtt?.tmp_url || qrAtt?.url,
                qrString: typeof f["VietQR"] === "string" ? f["VietQR"] : String(f["Chuỗi QR"] || ""),
            });
        }

        // Lưu vào cache đĩa để toàn bộ các lần sau trong tháng không gọi API nữa
        if (bills.length > 0) {
            saveMonthlyBillsCache({
                monthKey: currentMonthKey,
                fetchedAt: new Date().toISOString(),
                totalRecords: bills.length,
                bills,
            });
        }

        return bills;
    } catch (err: any) {
        if (err.response?.data?.code === 99991403) {
            recordLarkQuotaExceeded(err.response?.data?.msg);
        } else {
            console.error("[billService] Lỗi khi đọc bảng BILLS từ Lark Base:", err.response?.data || err.message);
        }
        if (existingCache && existingCache.bills.length > 0) {
            return existingCache.bills;
        }
        return [];
    }
}

/**
 * Gửi một hóa đơn cụ thể tới Zalo User ID
 */
export async function sendBillToUser(bill: BillRecord, targetUserId: string): Promise<boolean> {
    try {
        const messageText = formatBillNotification(bill);
        const buttons = [
            { title: "✅ Đã chuyển khoản", payload: `Đã chuyển khoản bill phòng ${bill.roomNumber}` },
            { title: "📞 Cần hỗ trợ", payload: "Liên hệ" },
        ];

        // 1. Gửi tin nhắn thông báo tóm tắt hóa đơn kèm 2 nút tương tác
        await sendQuickReplies(targetUserId, messageText, buttons);

        // 2. Gửi mã QR ngân hàng để quét chuyển khoản (Tận dụng qrAttachmentId đã cache để tiết kiệm upload)
        let qrAttachmentId: string | null = bill.qrAttachmentId || null;
        if (!qrAttachmentId) {
            if (bill.qrImageUrl) {
                qrAttachmentId = await downloadAndUploadToZalo(bill.qrImageUrl);
            }
            if (!qrAttachmentId) {
                qrAttachmentId = await generateAndUploadVietQr({
                    amount: bill.totalAmount,
                    roomNumber: bill.roomNumber,
                });
            }
            if (qrAttachmentId) {
                bill.qrAttachmentId = qrAttachmentId;
            }
        }

        if (qrAttachmentId) {
            console.log(`[billService] Gửi ảnh mã VietQR tới user ${targetUserId}...`);
            await sendAttachmentImage(targetUserId, qrAttachmentId);
        }

        // 3. Nếu có ảnh hóa đơn chi tiết đính kèm từ Lark thì gửi tiếp ảnh hóa đơn
        if (bill.billImageUrl) {
            let billAttachmentId: string | null = bill.billAttachmentId || null;
            if (!billAttachmentId) {
                billAttachmentId = await downloadAndUploadToZalo(bill.billImageUrl);
                if (billAttachmentId) {
                    bill.billAttachmentId = billAttachmentId;
                }
            }
            if (billAttachmentId) {
                console.log(`[billService] Gửi ảnh Bill chi tiết tới user ${targetUserId}...`);
                await sendAttachmentImage(targetUserId, billAttachmentId);
            }
        }

        console.log(`[billService] ✅ Đã gửi thành công bill phòng ${bill.roomNumber} tới user ${targetUserId}`);
        return true;
    } catch (err: any) {
        console.error(`[billService] ❌ Lỗi gửi bill tới user ${targetUserId}:`, err.message);
        return false;
    }
}

/**
 * TIẾN TRÌNH TỰ ĐỘNG CHÍNH (Được kích hoạt lúc 20:00 ngày 1 hằng tháng)
 */
export async function dispatchMonthlyBills(): Promise<{ total: number; sent: number; skipped: number; errors: number }> {
    console.log("[billService] 🚀 Đang quét danh sách hóa đơn từ Lark Base (hoặc cache)...");
    // Ngày 1 đầu tháng: gọi forceRefresh=true để đồng bộ bảng mới nhất 1 lần duy nhất
    const bills = await fetchBillsFromLark(true);

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const bill of bills) {
        // Chỉ gửi những bill chưa gửi hoặc trạng thái Chờ gửi
        const st = (bill.status || "").toLowerCase();
        if (st.includes("đã gửi") || st.includes("đã thanh toán")) {
            skipped++;
            continue;
        }

        const zaloUserId = findZaloUserByRoom(bill.roomNumber);
        if (!zaloUserId) {
            console.warn(`[billService] ⚠️ Không tìm thấy Zalo UID của cư dân phòng ${bill.roomNumber}. Bỏ qua.`);
            skipped++;
            continue;
        }

        const ok = await sendBillToUser(bill, zaloUserId);
        if (ok) {
            sent++;
        } else {
            errors++;
        }

        // Tạm nghỉ 500ms giữa các tin nhắn để tuân thủ tốc độ Zalo API
        await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[billService] 🏁 Kết thúc gửi hóa đơn tháng: Tổng ${bills.length} | Gửi: ${sent} | Bỏ qua: ${skipped} | Lỗi: ${errors}`);
    return { total: bills.length, sent, skipped, errors };
}

/**
 * GỬI HÓA ĐƠN THỬ NGHIỆM TẠI HÀNG 28 CHO WHITELIST (Tester & Admin)
 */
export async function sendRow28BillToWhitelist(): Promise<{ success: boolean; bill?: BillRecord; recipients: string[]; error?: string }> {
    const recipients = getWhitelistRecipients();
    if (recipients.length === 0) {
        return { success: false, recipients: [], error: "Danh sách whitelist trống." };
    }

    const bills = await fetchBillsFromLark(false);
    let targetBill: BillRecord;

    if (bills.length >= 28) {
        targetBill = bills[27];
        console.log(`[billService] 📄 Đã lấy dữ liệu hàng 28 từ bảng BILLS: Phòng ${targetBill.roomNumber} - ${targetBill.tenantName}`);
    } else if (bills.length > 0) {
        targetBill = bills[bills.length - 1];
        console.log(`[billService] ℹ️ Bảng có ${bills.length} hàng. Chọn hàng hiện có: Phòng ${targetBill.roomNumber} - ${targetBill.tenantName}`);
    } else {
        const nextMonth = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        targetBill = {
            recordId: "ROW_28_LARK_BASE",
            maHoaDon: `HD_38PBV_601_${nextMonth}${year}`,
            roomNumber: "601",
            building: "38PBV",
            tenantName: "Nguyễn Thục Linh",
            contractCode: `HD_38PBV/601_291026`,
            phone: "0945234616",
            rentAmount: 4500000,
            electricityKwh: 120,
            electricityAmount: 480000,
            waterAmount: 150000,
            serviceAmount: 150000,
            otherFee: 0,
            discount: 0,
            previousDebt: 0,
            totalAmount: 5280000,
            billingPeriod: `Tháng ${nextMonth}/${year}`,
            dueDate: `05/${nextMonth.toString().padStart(2, "0")}/${year}`,
            status: "Chờ gửi",
        };

        const currentMonthKey = `${year}-${String(nextMonth).padStart(2, "0")}`;
        saveMonthlyBillsCache({
            monthKey: currentMonthKey,
            fetchedAt: new Date().toISOString(),
            totalRecords: 1,
            bills: [targetBill],
        });
        console.log(`[billService] 📄 Khởi tạo dữ liệu hàng 28 mô phỏng (Phòng 601 - Nguyễn Thục Linh) vào cache.`);
    }

    console.log(`[billService] 🧪 Bắt đầu gửi hóa đơn hàng 28 cho Whitelist: ${recipients.join(", ")}`);

    for (const uid of recipients) {
        await sendBillToUser(targetBill, uid);
        await new Promise((r) => setTimeout(r, 600));
    }

    return { success: true, bill: targetBill, recipients };
}

/**
 * GỬI HÓA ĐƠN THỬ NGHIỆM CHO WHITELIST
 */
export async function sendTestBillToWhitelist(): Promise<{ success: boolean; recipients: string[]; error?: string }> {
    const res = await sendRow28BillToWhitelist();
    return { success: res.success, recipients: res.recipients, error: res.error };
}
