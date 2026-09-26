import { getNewIncidentRecords, markIncidentNotified, IncidentRecord } from "../lark/larkClient";
import { notifyAdmin } from "../zaloClient";

let isPolling = false;

/**
 * Format tin nhắn thông báo Admin khi có sự cố mới từ Lark Base Form
 */
function formatAdminIncidentNotification(incident: IncidentRecord): string {
    const maCode = incident.maCode || "Chưa có mã";
    const thoiGian = incident.thoiGian
        ? new Date(Number(incident.thoiGian)).toLocaleString("vi-VN")
        : new Date().toLocaleString("vi-VN");
    const sdt = incident.sdtLienHe || "Chưa cung cấp";
    const zaloId = incident.zaloUserId || "Không rõ";

    return `🛠️ [SỰ CỐ MỚI - CẦN XỬ LÝ]
━━━━━━━━━━━━━━━━━━━━
• Mã sự cố: ${maCode}
• Tòa nhà: ${incident.toaNha || "38PBV"}
• Số phòng: ${incident.soPhong || "Chưa rõ"}
• Loại sự cố: ${incident.loaiSuCo || "Chưa phân loại"}
• Mô tả: "${incident.moTa || "Không có mô tả"}"
• Trạng thái: ${incident.trangThai}
• SĐT liên hệ: ${sdt}
• Zalo ID cư dân: ${zaloId}
• Thời gian ghi nhận: ${thoiGian}
━━━━━━━━━━━━━━━━━━━━
📋 Xem chi tiết & cập nhật tại Lark Base`;
}

/**
 * Quét bảng INCIDENT_REPORTS, tìm record mới và gửi thông báo cho Admin.
 * Trả về số lượng sự cố đã thông báo.
 */
export async function pollNewIncidents(): Promise<number> {
    if (isPolling) {
        console.log("[incidentNotifyPoller] Lần quét trước đang chạy, bỏ qua lần này.");
        return 0;
    }

    isPolling = true;
    let notifiedCount = 0;

    try {
        const newIncidents = await getNewIncidentRecords();

        if (!newIncidents || newIncidents.length === 0) {
            return 0;
        }

        console.log(`[incidentNotifyPoller] Tìm thấy ${newIncidents.length} sự cố mới chưa thông báo admin.`);

        for (const incident of newIncidents) {
            try {
                const adminMsg = formatAdminIncidentNotification(incident);

                // Gửi thông báo cho Admin qua Zalo
                await notifyAdmin(adminMsg);

                // Đánh dấu đã thông báo trong Lark Base
                const marked = await markIncidentNotified(incident.recordId);
                if (marked) {
                    notifiedCount++;
                    console.log(`[incidentNotifyPoller] ✅ Đã thông báo admin về sự cố #${incident.maCode || incident.recordId}`);
                } else {
                    console.warn(`[incidentNotifyPoller] ⚠️ Không đánh dấu được record ${incident.recordId} — có thể thiếu cột "Đã thông báo admin" trong Lark Base.`);
                    notifiedCount++; // Vẫn đếm vì đã gửi thông báo thành công
                }
            } catch (err: any) {
                console.error(`[incidentNotifyPoller] Lỗi khi xử lý sự cố ${incident.recordId}:`, err.message);
            }
        }

        if (notifiedCount > 0) {
            console.log(`[incidentNotifyPoller] Hoàn tất: đã thông báo admin về ${notifiedCount} sự cố mới.`);
        }
    } catch (err: any) {
        console.error("[incidentNotifyPoller] Lỗi khi quét INCIDENT_REPORTS:", err.message);
    } finally {
        isPolling = false;
    }

    return notifiedCount;
}

/**
 * Khởi động polling định kỳ kiểm tra sự cố mới (mặc định mỗi 60 giây)
 */
export function startIncidentNotifyPoller(intervalMs: number = 60000): NodeJS.Timeout {
    console.log(`[incidentNotifyPoller] Đã khởi động Poller kiểm tra sự cố mới (chu kỳ: ${intervalMs / 1000}s)`);

    // Chạy thử lần đầu ngay khi khởi động (delay 5s để server ổn định)
    setTimeout(() => {
        pollNewIncidents().catch((e) =>
            console.error("[incidentNotifyPoller] Lỗi lần quét đầu:", e.message)
        );
    }, 5000);

    return setInterval(() => {
        pollNewIncidents().catch((e) =>
            console.error("[incidentNotifyPoller] Lỗi định kỳ:", e.message)
        );
    }, intervalMs);
}

/**
 * Dừng Poller
 */
export function stopIncidentNotifyPoller(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    console.log("[incidentNotifyPoller] Đã dừng Poller kiểm tra sự cố.");
}
