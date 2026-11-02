# Zalo OA Bot - Quản Gia Tòa Nhà Thông Minh (Sunhavens 38PBV)

Chatbot quản lý căn hộ, tòa nhà tích hợp Official Account Zalo (TypeScript / Express).  
Hệ thống kết hợp giữa kiến trúc **Offline-First (Cư dân CSV)**, tự động gửi hóa đơn thông minh (tiết kiệm quota Lark Base), và cấp mã mở cửa điện tử TTLock Cloud.

---

## 📚 TÀI LIỆU CHI TIẾT
* [Kiến trúc hệ thống chi tiết (ARCHITECTURE.md)](docs/ARCHITECTURE.md) — Sơ đồ luồng, cơ chế RAM cache, chống chiếm quyền tài khoản, và bộ lọc gửi hóa đơn.
* [Hướng dẫn quản trị viên (ADMIN_GUIDE.md)](docs/ADMIN_GUIDE.md) — Hướng dẫn kéo thả file CSV qua Zalo OA, các cú pháp lệnh quản trị, và quy trình gửi hóa đơn.

---

## 🌟 TÍNH NĂNG NỔI BẬT

1. **Quản lý Cư dân Offline 100% (Tiết kiệm Quota Lark Base)**:
   * Toàn bộ danh bạ cư dân được lưu trữ tại `data/tenants.csv` và `data/active-links.json`.
   * **RAM Cache thông minh**: Đọc danh bạ trong 0ms, tự động kiểm tra `mtime` và dung lượng file để tránh đọc đĩa.
   * **Hot-Reload Watcher**: Tự động phát hiện khi file CSV được cập nhật và nạp lại vào RAM mà không cần restart server.

2. **Cập nhật Danh bạ CSV trực tiếp qua Khung Chat Zalo**:
   * Admin chỉ cần kéo thả file `.csv` vào khung chat Zalo OA hoặc gửi cú pháp `#csv <link_tải>`.
   * Tự động kiểm tra tính hợp lệ của file (bắt buộc có Họ tên, CCCD, Số phòng).
   * Tự động sao lưu bản cũ vào `data/backups/tenants_YYYYMMDD_HHmmss.csv` trước khi ghi đè.

3. **Gửi Hóa đơn Tự động 20:00 Ngày 1 Hàng Tháng**:
   * **Bộ lọc Cư dân có Tag**: Chỉ tải ảnh và gửi hóa đơn cho những phòng đã có cư dân liên kết tag Zalo. Phòng chưa có tag sẽ bỏ qua hoàn toàn để tiết kiệm quota.
   * **Persistent Cache**: Lưu trữ mã Zalo `attachment_id` của ảnh hóa đơn và mã QR, giúp cư dân hỏi lại trong tháng phản hồi ngay trong 0ms.
   * Tạo ảnh VietQR NAPAS tự động có sẵn số tài khoản, số tiền và nội dung chuyển khoản phòng.

4. **Xác thực Cư dân & Cấp Mã Khóa TTLock Tự động**:
   * **Gatekeeper 2 Yếu Tố**: Bắt buộc Họ tên và CCCD trùng khớp với hợp đồng thuê trước khi kích hoạt tag.
   * **Chống chiếm quyền**: Mỗi CCCD chỉ được liên kết 1 Zalo UID duy nhất; mỗi Zalo UID chỉ được liên kết 1 phòng duy nhất.
   * Cấp mã PIN 30 phút cho Cửa to, Cửa nhỏ (Cổng phụ/Shipper), Cửa Gara xe và Cửa phòng riêng.

5. **Báo Sự Cố & Hỏng Hóc**:
   * Tự động tạo link form báo sự cố trên Lark Base với thông tin số phòng, tòa nhà và Zalo UID đã điền sẵn (`pre-fill`).

---

## 🛠️ CÀI ĐẶT & VẬN HÀNH

### 1. Cài đặt thư viện
```bash
cd chatbot
npm install
cp .env.example .env
```

### 2. Cấu hình biến môi trường (.env)
* `ZALO_APP_ID`, `ZALO_APP_SECRET`: Lấy từ trang quản trị App tại developers.zalo.me.
* `ZALO_ADMIN_USER_ID`, `ADMIN_ZALO_USER_IDS`: Danh sách Zalo UID của Admin.
* `TTLOCK_CLIENT_ID`, `TTLOCK_ACCESS_TOKEN`: Tài khoản TTLock Cloud API để tạo passcode.
* `LARK_BASE_APP_TOKEN`, `LARK_BILLS_TABLE_ID`: Thông tin bảng BILLS trên Lark Base.

### 3. Khởi chạy
```bash
# Chế độ phát triển (Tự reload khi code thay đổi)
npm run dev

# Biên dịch và chạy Production
npm run build
npm start
```
