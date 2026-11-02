# HƯỚNG DẪN DÀNH CHO QUẢN TRỊ VIÊN (ADMIN GUIDE)
> **Zalo OA Chatbot - Tòa nhà Sunhavens 38 Phan Bá Vành**  
> **Dành cho:** Ban Quản Lý & Admin Hệ Thống

---

## 1. CÁC TÀI KHOẢN ADMIN ĐƯỢC ỦY QUYỀN

Các lệnh quản trị và tính năng tải file cấu hình chỉ có hiệu lực khi gửi từ các tài khoản Zalo UID sau:
* `4724202976037526351` (Admin Chính)
* `6962737755353011552` (Tester / Admin Phụ)
* Các ID được cấu hình trong biến môi trường `.env` (`ADMIN_ZALO_USER_IDS`).

---

## 2. QUY TRÌNH CẬP NHẬT DANH BẠ CƯ DÂN HÀNG THÁNG (TENANTS CSV)

Định kỳ mỗi tháng (hoặc khi có cư dân mới chuyển vào / chuyển đi), Admin cập nhật danh bạ theo một trong hai cách dưới đây mà **không cần khởi động lại bot hay truy cập server**:

### Cách 1: Gửi file trực tiếp qua khung chat Zalo OA (Khuyên dùng)
1. Xuất file danh bạ cư dân từ Lark Base (hoặc Excel) và lưu dưới định dạng `.csv`.
2. Mở Zalo OA trên điện thoại hoặc máy tính từ tài khoản Admin.
3. Bấm vào biểu tượng đính kèm File (hình cái kẹp giấy hoặc dấu `+`).
4. Chọn file `.csv` vừa xuất và nhấn Gửi.
5. Bot sẽ tự động kiểm tra, sao lưu bản cũ vào `data/backups/`, ghi đè và nạp mới dữ liệu trong 1 giây.
6. Bot gửi tin nhắn báo cáo kết quả gồm: Tên file, tổng số cư dân, số phòng và tên file sao lưu.

### Cách 2: Gửi link download trực tiếp
1. Tải file CSV lên một đường link trực tiếp (hoặc Lark Base attachment link).
2. Nhắn tin vào Zalo OA theo cú pháp:
   ```
   #csv https://link-tai-file.com/danh_sach_cu_dan.csv
   ```
3. Bot sẽ tự tải về, đối soát và nạp vào bộ nhớ.

### ⚠️ Quy định bắt buộc về cấu trúc file CSV
File CSV phải chứa ít nhất 3 cột bắt buộc sau (không phân biệt chữ hoa, chữ thường, có hoặc không dấu):
* **Họ và tên**: `Họ và tên cư dân`, `Họ tên`, `Tên`, hoặc `Name`.
* **Số CCCD/CMND**: `Số CCCD`, `CCCD`, `CMND`, hoặc `Định danh`.
* **Số phòng**: `Mã phòng`, `Số phòng`, `Phòng`, hoặc `Room`.
* *(Tùy chọn khuyến nghị)*: `Số điện thoại`, `Vai trò` (*Chủ hộ* hoặc *Cùng lưu trú*), `Toà nhà` (*38PBV*).

---

## 3. CÁC LỆNH ADMIN ĐIỀU KHIỂN QUA TIN NHẮN CHAT

Bạn có thể gửi các tin nhắn lệnh sau từ tài khoản Admin để kiểm tra và vận hành bot:

| Lệnh nhắn tin | Chức năng | Kết quả thực hiện |
| :--- | :--- | :--- |
| `test bill` hoặc `bill 28` | Gửi thử nghiệm hóa đơn hàng 28 cho Whitelist | Lấy hóa đơn hàng 28 từ bảng BILLS Lark Base và gửi kèm ảnh QR VietQR cho Tester & Admin |
| `#sync bills` hoặc `#refresh bills` | Đồng bộ cưỡng bức hóa đơn mới từ Lark Base | Xóa cache cũ, tải toàn bộ hóa đơn tháng mới từ Lark Base và ghi vào cache đĩa |
| `#untag 102` hoặc `#remove tag 102` | Hủy liên kết tag cư dân của một phòng | Gỡ tag phòng 102 trong `active-links.json`, cho phép cư dân mới liên kết lại |
| `#pause` | Tạm dừng bot tự động trong 30 phút | Dành cho lúc Admin muốn tự tay chat trực tiếp với cư dân mà không bị bot chen ngang |
| `#resume` | Bật lại bot tự động ngay lập tức | Hủy chế độ tạm dừng, bot tiếp tục phục vụ tự động |
| `#admin help` | Hiển thị bảng trợ giúp lệnh quản trị | Bot liệt kê toàn bộ các lệnh Admin có thể sử dụng |

---

## 4. QUY TRÌNH TỰ ĐỘNG GỬI HÓA ĐƠN THÁNG

1. **Lịch tự động**: Đúng **20h00 ngày 1 hàng tháng**, Cron Job sẽ tự động kích hoạt tiến trình gửi hóa đơn.
2. **Cơ chế lọc thông minh**:
   * Chỉ những phòng **đã có cư dân liên kết tag Zalo** (`active-links.json`) mới được xử lý.
   * Những phòng chưa có người thuê hoặc cư dân chưa liên kết Zalo sẽ **bị bỏ qua hoàn toàn** (không gọi tải ảnh, không upload CDN để tiết kiệm quota Zalo và Lark).
3. **Nội dung cư dân nhận được**:
   * Tin nhắn tóm tắt tiền phòng, tiền điện, tiền nước, phí dịch vụ kèm 2 nút: `✅ Đã chuyển khoản` và `📞 Cần hỗ trợ`.
   * Ảnh mã VietQR NAPAS chuẩn (có sẵn số tài khoản Sunhavens, số tiền, và nội dung chuyển khoản theo phòng).
   * Ảnh hóa đơn chi tiết được tải từ Lark Base (nếu có đính kèm).
