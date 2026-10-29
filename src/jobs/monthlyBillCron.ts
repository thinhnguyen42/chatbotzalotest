import cron from "node-cron";
import { dispatchMonthlyBills } from "../billing/billService";

let billCronTask: any = null;

/**
 * Khởi động tiến trình Cron Job gửi hóa đơn tự động lúc 20:00 ngày 1 hằng tháng
 */
export function startMonthlyBillCron(): void {
    if (billCronTask) {
        console.log("[monthlyBillCron] Tiến trình Cron Job gửi hóa đơn đã chạy trước đó.");
        return;
    }

    // Biểu thức Cron: "0 20 1 * *" -> Phút 0, Giờ 20, Ngày 1, Mọi tháng
    billCronTask = cron.schedule(
        "0 20 1 * *",
        async () => {
            console.log("[monthlyBillCron] ⏰ === 20:00 NGÀY 1: KÍCH HOẠT TIẾN TRÌNH GỬI HÓA ĐƠN THÁNG TỰ ĐỘNG ===");
            try {
                const res = await dispatchMonthlyBills();
                console.log(`[monthlyBillCron] ✅ Hoàn tất gửi hóa đơn: Tổng ${res.total}, Đã gửi ${res.sent}, Bỏ qua ${res.skipped}, Lỗi ${res.errors}`);
            } catch (err: any) {
                console.error("[monthlyBillCron] ❌ Lỗi nghiêm trọng khi chạy cron gửi hóa đơn:", err.message);
            }
        },
        {
            timezone: "Asia/Ho_Chi_Minh",
        }
    );

    console.log("[monthlyBillCron] ⏰ Đã kích hoạt Cron Job gửi hóa đơn tự động lúc 20:00 ngày 1 hằng tháng (Múi giờ Asia/Ho_Chi_Minh).");
}

export function stopMonthlyBillCron(): void {
    if (billCronTask) {
        billCronTask.stop();
        billCronTask = null;
        console.log("[monthlyBillCron] Đã dừng Cron Job gửi hóa đơn.");
    }
}
