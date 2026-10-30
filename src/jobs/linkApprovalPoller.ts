import fs from "fs";
import path from "path";
import {
    getAllLinkRequests,
    getContractByCccd,
    getContractByPhone,
    markLinkRequestAsProcessed,
    isLarkQuotaBlocked,
} from "../lark/larkClient";
import {
    processApprovedLink,
    revokeTenantLink,
    ActiveTenantLink,
} from "../user/linkApproval";

const ACTIVE_LINKS_FILE = path.resolve(process.cwd(), "data", "active-links.json");

let isPolling = false;
let isInitialized = false;
let lastNightPollTime = 0;

/**
 * Kiểm tra xem có đang trong khung giờ nghỉ ngơi (23h đêm - 7h sáng) hay không.
 * Trong khung giờ này, giãn tần suất quét để tiết kiệm tối đa quota API Lark Base.
 */
function isQuietHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 7;
}

function loadActiveLinks(): Map<string, ActiveTenantLink> {
    try {
        if (fs.existsSync(ACTIVE_LINKS_FILE)) {
            const raw = fs.readFileSync(ACTIVE_LINKS_FILE, "utf-8");
            const data = JSON.parse(raw);
            const map = new Map<string, ActiveTenantLink>();
            for (const [k, v] of Object.entries(data)) {
                map.set(k, v as ActiveTenantLink);
            }
            return map;
        }
    } catch (err: any) {
        console.warn("[linkApprovalPoller] Không thể đọc active-links.json:", err.message);
    }
    return new Map<string, ActiveTenantLink>();
}

function saveActiveLinks(map: Map<string, ActiveTenantLink>): void {
    try {
        const obj: Record<string, ActiveTenantLink> = {};
        for (const [k, v] of map.entries()) {
            obj[k] = v;
        }
        const dir = path.dirname(ACTIVE_LINKS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const newContent = JSON.stringify(obj, null, 2);
        if (fs.existsSync(ACTIVE_LINKS_FILE)) {
            const currentContent = fs.readFileSync(ACTIVE_LINKS_FILE, "utf-8");
            if (currentContent === newContent) {
                return; // Không ghi đè nếu nội dung không đổi (tránh kích hoạt nodemon restart)
            }
        }
        fs.writeFileSync(ACTIVE_LINKS_FILE, newContent, "utf-8");
    } catch (err: any) {
        console.warn("[linkApprovalPoller] Không thể ghi active-links.json:", err.message);
    }
}

/**
 * Quét danh sách các yêu cầu liên kết từ Lark Base:
 * 1. Tự động kích hoạt & gán Tag Zalo OA khi Admin duyệt ("Đã duyệt")
 * 2. TỰ ĐỘNG GỠ TAG & HỦY QUYỀN CƯ DÂN khi Admin bấm "Từ chối" hoặc xóa dòng trên Lark Base!
 */
export async function pollApprovedLinkRequests(): Promise<number> {
    if (isLarkQuotaBlocked()) {
        return 0;
    }

    if (isQuietHours()) {
        const now = Date.now();
        // Ban đêm (23h-7h) giãn chu kỳ ra ít nhất 60 phút mới quét 1 lần để tiết kiệm API
        if (lastNightPollTime && now - lastNightPollTime < 60 * 60 * 1000) {
            return 0;
        }
        lastNightPollTime = now;
        console.log("[linkApprovalPoller] 🌙 Đang trong khung giờ nghỉ ngơi (23h-7h), quét định kỳ tiết kiệm API...");
    }

    if (isPolling) {
        console.log("[linkApprovalPoller] Lần quét trước đang chạy, bỏ qua lần này.");
        return 0;
    }

    isPolling = true;
    let processedCount = 0;

    try {
        const allRecords = await getAllLinkRequests();
        if (allRecords === null) {
            console.warn("[linkApprovalPoller] Không kết nối được Lark Base (timeout/mạng). Bỏ qua lần quét này để bảo vệ dữ liệu cư dân.");
            return 0;
        }

        const activeLinks = loadActiveLinks();

        // Bảo vệ dữ liệu: nếu Lark Base trả về rỗng nhưng máy chủ đang có activeLinks, bỏ qua để tránh xóa nhầm do sự cố tạm thời
        if (activeLinks.size > 0 && allRecords.length === 0) {
            console.warn(`[linkApprovalPoller] Cảnh báo: Lark Base trả về 0 bản ghi trong khi có ${activeLinks.size} liên kết đang lưu. Tạm hoãn để kiểm tra ở chu kỳ sau.`);
            return 0;
        }

        // Khởi tạo lần đầu nếu activeLinks đang trống: nạp các record "Đã duyệt" hiện có
        if (!isInitialized && activeLinks.size === 0 && allRecords.length > 0) {
            for (const rec of allRecords) {
                if (rec.status === "Đã duyệt" && rec.zaloUserId) {
                    const contract =
                        (rec.cccd ? await getContractByCccd(rec.cccd) : null) ||
                        (rec.phone ? await getContractByPhone(rec.phone) : null);
                    if (contract) {
                        activeLinks.set(rec.recordId, {
                            recordId: rec.recordId,
                            zaloUserId: rec.zaloUserId,
                            tagCode: contract.tagCode,
                            roomNumber: contract.roomNumber,
                            tenantName: contract.tenantName,
                            phone: contract.phone,
                            cccd: contract.cccd,
                        });
                    }
                }
            }
            saveActiveLinks(activeLinks);
            isInitialized = true;
        } else {
            isInitialized = true;
        }

        const currentRecordMap = new Map(allRecords.map((r) => [r.recordId, r]));

        // 1. XỬ LÝ DUYỆT MỚI: các record có status === "Đã duyệt"
        for (const req of allRecords) {
            if (req.status === "Đã duyệt") {
                if (!req.processedByBot) {
                    try {
                        const res = await processApprovedLink(req);
                        if (res.success) {
                            processedCount++;
                            if (res.activeLink) {
                                activeLinks.set(req.recordId, res.activeLink);
                            }
                        }
                    } catch (err: any) {
                        console.error(`[linkApprovalPoller] Lỗi khi xử lý duyệt record ${req.recordId}:`, err.message);
                    }
                } else if (!activeLinks.has(req.recordId)) {
                    // Đã duyệt trước đó nhưng chưa được ghi vào activeLinks
                    const contract =
                        (req.cccd ? await getContractByCccd(req.cccd) : null) ||
                        (req.phone ? await getContractByPhone(req.phone) : null);
                    if (contract) {
                        activeLinks.set(req.recordId, {
                            recordId: req.recordId,
                            zaloUserId: req.zaloUserId,
                            tagCode: contract.tagCode,
                            roomNumber: contract.roomNumber,
                            tenantName: contract.tenantName,
                            phone: contract.phone,
                            cccd: contract.cccd,
                        });
                    }
                }
            }
        }

        // 2. TỰ ĐỘNG GỠ TAG KHI ADMIN BẤM Ở LARK BASE:
        // (Kiểm tra xem record từng duyệt có bị chuyển sang "Từ chối" hoặc bị XÓA khỏi Lark Base không)
        for (const [recordId, activeInfo] of Array.from(activeLinks.entries())) {
            if (!currentRecordMap.has(recordId)) {
                // TRƯỜNG HỢP 1: Admin đã bấm XÓA dòng bản ghi này khỏi Lark Base!
                console.log(
                    `[linkApprovalPoller] 🗑️ Record ${recordId} đã bị xóa trên Lark Base. Đang tự động gỡ Tag [${activeInfo.tagCode}] cho Zalo UID ${activeInfo.zaloUserId}...`
                );
                await revokeTenantLink({
                    recordId,
                    zaloUserId: activeInfo.zaloUserId,
                    tagCode: activeInfo.tagCode,
                    roomNumber: activeInfo.roomNumber,
                });
                activeLinks.delete(recordId);
                processedCount++;
            } else {
                const currentRec = currentRecordMap.get(recordId)!;
                if (currentRec.status === "Từ chối" || (currentRec.status !== "Đã duyệt" && currentRec.status !== "Chờ duyệt")) {
                    // TRƯỜNG HỢP 2: Admin đã bấm chuyển cột "TRẠNG THÁI" sang "Từ chối" trên Lark Base!
                    console.log(
                        `[linkApprovalPoller] 🚫 Record ${recordId} đã được Admin chuyển sang "${currentRec.status}" trên Lark Base. Đang tự động gỡ Tag [${activeInfo.tagCode}] cho Zalo UID ${activeInfo.zaloUserId}...`
                    );
                    await revokeTenantLink({
                        recordId,
                        zaloUserId: activeInfo.zaloUserId,
                        tagCode: activeInfo.tagCode,
                        roomNumber: activeInfo.roomNumber,
                    });
                    await markLinkRequestAsProcessed(recordId).catch(() => {});
                    activeLinks.delete(recordId);
                    processedCount++;
                }
            }
        }

        // 3. XỬ LÝ CÁC RECORD "Từ chối" CHƯA ĐÁNH DẤU XỬ LÝ (Nếu có)
        for (const req of allRecords) {
            if (req.status === "Từ chối" && !req.processedByBot && req.zaloUserId) {
                const contract =
                    (req.cccd ? await getContractByCccd(req.cccd) : null) ||
                    (req.phone ? await getContractByPhone(req.phone) : null);
                await revokeTenantLink({
                    recordId: req.recordId,
                    zaloUserId: req.zaloUserId,
                    tagCode: contract?.tagCode,
                    roomNumber: contract?.roomNumber,
                });
                await markLinkRequestAsProcessed(req.recordId).catch(() => {});
                activeLinks.delete(req.recordId);
                processedCount++;
            }
        }

        saveActiveLinks(activeLinks);
    } catch (err: any) {
        console.error("[linkApprovalPoller] Lỗi khi quét danh sách liên kết từ Lark Base:", err.message);
    } finally {
        isPolling = false;
    }

    return processedCount;
}

/**
 * Khởi động tiến trình Poller định kỳ (mặc định 15 phút = 900,000ms để tối ưu API cho nhà trọ ~16 phòng)
 */
export function startLinkApprovalPoller(intervalMs?: number): NodeJS.Timeout {
    const finalInterval = intervalMs ?? (Number(process.env.LINK_APPROVAL_POLL_INTERVAL_MS) || 6 * 60 * 60 * 1000);
    console.log(`[linkApprovalPoller] ✅ Đã khởi động Poller kiểm tra duyệt/gỡ hồ sơ Lark Base (chu kỳ: ${finalInterval / 1000}s)`);
    // Chạy thử lần đầu ngay khi khởi động
    pollApprovedLinkRequests().catch((e) => console.error("[linkApprovalPoller] Lỗi lần quét đầu:", e.message));

    return setInterval(() => {
        pollApprovedLinkRequests().catch((e) => console.error("[linkApprovalPoller] Lỗi định kỳ:", e.message));
    }, finalInterval);
}

/**
 * Dừng tiến trình Poller
 */
export function stopLinkApprovalPoller(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    console.log("[linkApprovalPoller] Đã dừng Poller kiểm tra duyệt hồ sơ.");
}
