import { getApprovedLinkRequests } from "../lark/larkClient";
import { processApprovedLink } from "../user/linkApproval";

let isPolling = false;

/**
 * Quét danh sách các yêu cầu liên kết đã được Admin duyệt trên Lark Base và xử lý.
 * Trả về số lượng record đã xử lý.
 */
export async function pollApprovedLinkRequests(): Promise<number> {
    if (isPolling) {
        console.log("[linkApprovalPoller] Lần quét trước đang chạy, bỏ qua lần này.");
        return 0;
    }

    isPolling = true;
    let processedCount = 0;

    try {
        const approvedList = await getApprovedLinkRequests();
        if (!approvedList || approvedList.length === 0) {
            return 0;
        }

        console.log(`[linkApprovalPoller] Tìm thấy ${approvedList.length} yêu cầu đã duyệt cần xử lý.`);

        for (const req of approvedList) {
            if (!req.processedByBot) {
                try {
                    const res = await processApprovedLink(req);
                    if (res.success) {
                        processedCount++;
                    }
                } catch (err: any) {
                    console.error(`[linkApprovalPoller] Lỗi khi xử lý record ${req.recordId}:`, err.message);
                }
            }
        }

        if (processedCount > 0) {
            console.log(`[linkApprovalPoller] Đã hoàn tất xử lý ${processedCount} yêu cầu liên kết.`);
        }
    } catch (err: any) {
        console.error("[linkApprovalPoller] Lỗi khi quét danh sách duyệt từ Lark Base:", err.message);
    } finally {
        isPolling = false;
    }

    return processedCount;
}

/**
 * Khởi động tiến trình Poller định kỳ (mỗi 30-60 giây)
 */
export function startLinkApprovalPoller(intervalMs: number = 30000): NodeJS.Timeout {
    console.log(`[linkApprovalPoller] Đã khởi động Poller kiểm tra duyệt hồ sơ Lark Base (chu kỳ: ${intervalMs / 1000}s)`);
    // Chạy thử lần đầu ngay khi khởi động
    pollApprovedLinkRequests().catch((e) => console.error("[linkApprovalPoller] Lỗi lần quét đầu:", e.message));

    return setInterval(() => {
        pollApprovedLinkRequests().catch((e) => console.error("[linkApprovalPoller] Lỗi định kỳ:", e.message));
    }, intervalMs);
}

/**
 * Dừng tiến trình Poller
 */
export function stopLinkApprovalPoller(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    console.log("[linkApprovalPoller] Đã dừng Poller kiểm tra duyệt hồ sơ.");
}
