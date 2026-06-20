# Tài liệu Lưu ý dành cho Frontend khi tích hợp API Hóa đơn mới

Khi tích hợp luồng phát hành hóa đơn này, Frontend cần phối hợp chặt chẽ với Backend để xử lý các trạng thái giao diện và bắt các mã lỗi nghiệp vụ khi người dùng nhấn **Phát hành (Publish)**.

---

### 1. Quản lý trạng thái Nút bấm (Button States & Action Rules)

Dựa vào trạng thái (`status`) của hóa đơn nhận về từ API, Frontend bật/tắt các nút thao tác tương ứng:

| Trạng thái (`status`)           | Nút Sửa (Edit) | Nút Xóa (Delete) | Nút Phát hành (Publish) | Nút Hủy hóa đơn (Cancel) |
| :------------------------------ | :------------: | :--------------: | :---------------------: | :----------------------: |
| **`DRAFT`** (Bản nháp)          |     ✅ Bật     |      ✅ Bật      |         ✅ Bật          |          ❌ Ẩn           |
| **`PENDING_ISSUED`** (Đang chờ) |     ❌ Tắt     |      ❌ Tắt      |  ❌ Tắt (Hiện Loading)  |          ❌ Ẩn           |
| **`ISSUED`** (Đã phát hành)     |     ❌ Tắt     |      ❌ Tắt      |          ❌ Ẩn          |          ✅ Bật          |
| **`SYNC_FAILED`** (Lỗi đồng bộ) |     ❌ Tắt     |      ❌ Tắt      |  ✅ Hiện nút "Thử lại"  |          ✅ Bật          |
| **`CANCELED`** (Đã hủy)         |     ❌ Tắt     |      ❌ Tắt      |          ❌ Ẩn          |          ❌ Tắt          |

---

### 2. Kiểm tra & Cấu hình Kết nối Cơ quan Thuế (CQT Connection)

Khi người dùng nhấn **Phát hành** (`POST /invoices/:id/publish`) và hóa đơn thuộc diện **Cần cấp mã CQT** (ví dụ: `taxGroupId !== 1` hoặc `taxGroupId === 1` kèm cờ `requestCqtCode: true`), nếu tài khoản kết nối Cơ quan Thuế chưa hợp lệ, Backend sẽ trả về lỗi. 

Frontend không cần gọi thêm API kiểm tra cấu hình trước khi phát hành mà chỉ cần bắt các mã lỗi sau để xử lý:

* **Trường hợp chưa liên kết tài khoản**: Nhận lỗi `404 Not Found` kèm mã lỗi:
  ```json
  {
    "statusCode": 404,
    "message": "Tax connection not found.",
    "errorCode": "NOT_CONFIGURED"
  }
  ```
  **Xử lý trên FE**: Hiển thị thông báo yêu cầu liên kết tài khoản và điều hướng người dùng sang trang Cấu hình Thuế để thiết lập (gọi `PUT /tax-authority-connections`).

* **Trường hợp đã liên kết nhưng chưa xác thực (hoặc hết hạn)**: Nhận lỗi `400 Bad Request` kèm mã lỗi:
  ```json
  {
    "statusCode": 400,
    "message": "Tax connection not verified",
    "errorCode": "NOT_VERIFIED"
  }
  ```
  **Xử lý trên FE**: Hiển thị thông báo yêu cầu xác thực tài khoản và chuyển người dùng sang trang cấu hình kết nối.

* **Ngoại lệ**: Nếu hóa đơn là Phiếu bán lẻ thông thường (`taxGroupId === 1` và không tích chọn "Yêu cầu cấp mã"), Backend sẽ bỏ qua bước kiểm tra kết nối CQT này $\rightarrow$ Hóa đơn được phát hành và chuyển trạng thái `ISSUED` ngay lập tức.

---

### 3. Giao diện tùy chọn Cấp mã CQT (Dành cho Nhóm thuế 1)

Frontend cần lấy thông tin profile người dùng để biết họ thuộc Nhóm thuế nào (`taxGroupId`):

- **Nếu `taxGroupId !== 1`** (Nhóm 2, 3, 4): Luôn hiển thị mặc định hóa đơn sẽ được cấp mã CQT.
- **Nếu `taxGroupId === 1`** (Nhóm miễn thuế/quy mô nhỏ):
  - Hiển thị thêm checkbox: **`[ ] Yêu cầu cấp mã Cơ quan thuế (Xuất HĐĐT)`**.
  - Mặc định checkbox này nên để **Unchecked** (để tạo phiếu bán lẻ nhanh).
  - Khi người dùng tích chọn checkbox này, khi gọi API Phát hành, Frontend sẽ truyền thêm tham số `requestCqtCode: true`.

---

### 4. Phòng ngừa Double-Submit (Bấm phát hành 2 lần)

API phát hành hóa đơn (`POST /invoices/:id/publish`) là một **API bất đồng bộ chạy lâu** (do phải đợi phản hồi từ mock API của Cơ quan thuế).

- **Lưu ý cho FE**: Ngay khi người dùng nhấn nút "Phát hành", Frontend phải **disable ngay nút bấm** đó và hiển thị hiệu ứng Loading.
- Tránh trường hợp người dùng click liên tục 2-3 lần do mạng chậm, dẫn đến gửi nhiều yêu cầu trùng lặp lên backend.

---

### 5. Xử lý lỗi Hết hàng (`OUT_OF_STOCK`)

Khi Frontend gọi API phát hành, backend sẽ thực hiện validate kho. Nếu một sản phẩm trong hóa đơn bị hết hàng, backend sẽ trả về mã lỗi `400 Bad Request` kèm theo chi tiết:

- **Mã lỗi ví dụ**:
  ```json
  {
    "statusCode": 400,
    "message": "Insufficient stock for product: Sữa tươi. Available: 5, Requested: 10",
    "errorCode": "OUT_OF_STOCK"
  }
  ```
- **Lưu ý cho FE**: Cần bắt lỗi này và hiển thị hộp thoại cảnh báo (Modal/Toast) rõ ràng cho người dùng biết chính xác **sản phẩm nào đang bị thiếu** và **số lượng thực tế còn lại trong kho là bao nhiêu** để họ chỉnh sửa lại số lượng trước khi phát hành lại.

---

### 6. Cách hiển thị nhãn trạng thái (Status Labels & Colors)

Để người dùng dễ phân biệt giữa chứng từ bán lẻ bình thường và hóa đơn điện tử:

- **`DRAFT`**: Màu xám hoặc xanh nhạt. Nhãn: `"Phiếu tạm / Nháp"`
- **`PENDING_ISSUED`**: Màu cam + icon xoay. Nhãn: `"Đang xin mã CQT..."`
- **`ISSUED`**:
  - Nếu hóa đơn đó **có mã CQT**: Màu xanh lá. Nhãn `"HĐĐT đã phát hành"` (Kèm theo hiển thị mã CQT dưới dạng click-to-copy).
  - Nếu hóa đơn đó **không có mã CQT**: Màu xanh dương. Nhãn `"Phiếu bán hàng"` hoặc `"Hoàn thành"`.
- **`SYNC_FAILED`**: Màu đỏ. Nhãn `"Lỗi đồng bộ thuế"` (Hiện nút "Xem lỗi" và nút "Thử lại").
- **`CANCELED`**: Màu xám có gạch ngang chữ. Nhãn `"Đã hủy"`.
