import axios from "axios";
import { getTenantAccessToken, LARK_BASE_APP_TOKEN } from "../lark/larkClient";
import { getLocalActiveLinks } from "../user/tenantCsvService";
import { sendQuickReplies, sendImageMessage } from "../zaloClient";
import "dotenv/config";

// Cấu hình bảng BILLS trên Lark Base
// Link: https://ijpibh6qudtm.jp.larksuite.com/wiki/DLoyw8dASiH775kHdFUjj60epcd?table=tbli1d2mSqMo6oJa&view=vewi8vB86w
export const LARK_BILLS_TABLE_ID = process.env.LARK_BILLS_TABLE_ID || "tbli1d2mSqMo6oJa";
export const LARK_BILLS_VIEW_ID = process.env.LARK_BILLS_VIEW_ID || "vewi8vB86w";

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
 * Tạo URL mã QR thanh toán chuẩn VietQR (tự điền số tiền và cú pháp chuyển khoản)
 */
export function generateVietQrUrl(params: {
    bankId?: string;
    accountNo?: string;
    accountName?: string;
    amount: number;
    roomNumber: string;
    monthStr?: string;
}): string {
    const bankId = params.bankId || process.env.VIETQR_BANK_ID || "MB";
    const accountNo = params.accountNo || process.env.VIETQR_ACCOUNT_NO || "0945234616";
    const accountName = encodeURIComponent(params.accountName || process.env.VIETQR_ACCOUNT_NAME || "SUNHAVENS");
    const month = params.monthStr || `${new Date().getMonth() + 1}`;
    const description = encodeURIComponent(`TIEN PHONG ${params.roomNumber} T${month}`);

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${params.amount}&addInfo=${description}&accountName=${accountName}`;
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
        bill.dueDate ? `⏰ Hạn thanh toán: Trước ngày ${bill.dueDate}` : `⏰ Hạn thanh toán: Trước ngày 05 hàng tháng`,
        `━━━━━━━━━━━━━━━━━━`,
        `📌 Hướng dẫn thanh toán:`,
        `Quý cư dân mở ứng dụng Ngân hàng quét mã QR đính kèm bên dưới để thanh toán nhanh (đã tự động điền sẵn số tiền và nội dung chuyển khoản).`
    );

    return lines.join("\n");
}

/**
 * Quét danh sách hóa đơn từ bảng BILLS trên Lark Base
 */
export async function fetchBillsFromLark(): Promise<BillRecord[]> {
    try {
        const token = await getTenantAccessToken();
        const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${LARK_BILLS_TABLE_ID}/records`;

        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                view_id: LARK_BILLS_VIEW_ID,
                page_size: 100,
            },
            timeout: 10000,
        });

        const data = res.data;
        if (data?.code !== 0) {
            console.warn(`[billService] Lark API trả về code ${data?.code}: ${data?.msg}`);
            return [];
        }

        const items = data.data?.items || [];
        const bills: BillRecord[] = [];

        for (const item of items) {
            const f = item.fields || {};

            // Xử lý attachment Bill và QR
            const billAtt = Array.isArray(f["Bill"]) ? f["Bill"][0] : null;
            const qrAtt = Array.isArray(f["Mã QR"]) ? f["Mã QR"][0] : null;

            // Xử lý phòng (có thể là string hoặc array link)
            let room = String(f["Mã phòng"] || "");
            if (Array.isArray(f["Mã phòng"])) {
                room = f["Mã phòng"][0]?.text || String(f["Mã phòng"][0]);
            }

            // Xử lý tòa nhà
            let building = String(f["Toà nhà"] || "38PBV");
            if (Array.isArray(f["Toà nhà"])) {
                building = f["Toà nhà"][0]?.text || String(f["Toà nhà"][0]);
            }

            bills.push({
                recordId: item.record_id,
                maHoaDon: String(f["Mã hóa đơn"] || ""),
                roomNumber: room,
                building,
                tenantName: String(f["Tên chủ hộ"] || ""),
                contractCode: String(f["Mã hợp đồng"] || ""),
                phone: String(f["Số điện thoại"] || ""),
                rentAmount: Number(f["Tiền phòng"]) || 0,
                electricityKwh: Number(f["Điện tiêu thụ"]) || 0,
                electricityAmount: Number(f["Tổng tiền điện"]) || 0,
                waterAmount: Number(f["Tiền nước"]) || 0,
                serviceAmount: Number(f["Phí dịch vụ"]) || 0,
                otherFee: Number(f["Phí phát sinh"]) || 0,
                previousDebt: Number(f["Nợ tháng trước"]) || 0,
                discount: Number(f["Giảm"]) || 0,
                totalAmount: Number(f["Tổng thanh toán"]) || Number(f["TỔNG TIỀN PHẢI THU"]) || 0,
                billingPeriod: f["Thanh toán từ"] && f["Thanh toán đến"]
                    ? `${f["Thanh toán từ"]} - ${f["Thanh toán đến"]}`
                    : undefined,
                dueDate: f["Hạn thanh toán"] ? String(f["Hạn thanh toán"]) : "05",
                status: String(f["Trạng thái"] || "Chờ gửi"),
                billImageUrl: billAtt?.tmp_url || billAtt?.url,
                qrImageUrl: qrAtt?.tmp_url || qrAtt?.url,
                qrString: String(f["Chuỗi QR"] || f["VietQR"] || ""),
            });
        }

        return bills;
    } catch (err: any) {
        console.error("[billService] Lỗi khi đọc bảng BILLS từ Lark Base:", err.response?.data || err.message);
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

        // 2. Gửi mã QR ngân hàng để quét chuyển khoản
        const qrUrl = bill.qrImageUrl || generateVietQrUrl({
            amount: bill.totalAmount,
            roomNumber: bill.roomNumber,
        });

        if (qrUrl) {
            console.log(`[billService] Gửi ảnh mã VietQR tới user ${targetUserId}...`);
            await sendImageMessage(targetUserId, qrUrl);
        }

        // 3. Nếu có ảnh hóa đơn chi tiết đính kèm thì gửi tiếp ảnh hóa đơn
        if (bill.billImageUrl) {
            console.log(`[billService] Gửi ảnh Bill chi tiết tới user ${targetUserId}...`);
            await sendImageMessage(targetUserId, bill.billImageUrl);
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
    console.log("[billService] 🚀 Đang quét danh sách hóa đơn từ Lark Base...");
    const bills = await fetchBillsFromLark();

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
 * GỬI HÓA ĐƠN THỬ NGHIỆM CHO WHITELIST (Tester & Admin)
 */
export async function sendTestBillToWhitelist(): Promise<{ success: boolean; recipients: string[]; error?: string }> {
    const recipients = getWhitelistRecipients();
    if (recipients.length === 0) {
        return { success: false, recipients: [], error: "Danh sách whitelist trống." };
    }

    const nextMonth = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    // Hóa đơn mẫu thực tế
    const sampleBill: BillRecord = {
        recordId: "SAMPLE_RECORD_001",
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
        billingPeriod: `01/${nextMonth.toString().padStart(2, "0")}/${year} - 30/${nextMonth.toString().padStart(2, "0")}/${year}`,
        dueDate: `05/${nextMonth.toString().padStart(2, "0")}/${year}`,
        status: "Chờ gửi",
    };

    console.log(`[billService] 🧪 Bắt đầu gửi hóa đơn mẫu cho Whitelist: ${recipients.join(", ")}`);

    for (const uid of recipients) {
        await sendBillToUser(sampleBill, uid);
        await new Promise((r) => setTimeout(r, 600));
    }

    return { success: true, recipients };
}
