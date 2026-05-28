# Hướng Hướng Tích Hợp & Giải Đáp Nghiệp Vụ Module Vouchers (FE ↔ BE)

Tài liệu này hướng dẫn chi tiết cách tích hợp các API của module **Vouchers (Phiếu thu / Phiếu chi)** cho Frontend (FE), đồng thời làm rõ các ràng buộc nghiệp vụ kế toán thuế (chuyển khoản từ 5 triệu, tính kỳ, hủy/xóa phiếu) trên hệ thống.

---

## 1. Bản Đồ API Module Vouchers (BE Contract)

Tất cả các API của module Vouchers đều yêu cầu mã token đăng nhập (`JwtAuthGuard`) và được gác cổng bởi `PeriodLockGuard` (chặn thay đổi khi kỳ kế toán đã đóng):

| Chức năng | Method | Endpoint | Query Parameters / Body | Mô tả & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Thống kê dòng tiền** | `GET` | `/vouchers/summary` | Query: `fromDate` (bắt buộc) | Trả về tổng thu, tổng chi trong kỳ, và số dư tiền mặt/tiền gửi tích lũy đến hiện tại. |
| **Lấy danh sách** | `GET` | `/vouchers` | Query: `page`, `limit`, `fromDate` (tùy chọn) | Lấy danh sách phiếu thu/chi có phân trang. Nếu truyền `fromDate`, chỉ lọc danh sách phiếu trong tháng/quý đó. |
| **Chi tiết phiếu** | `GET` | `/vouchers/:voucherCode` | Tham số đường dẫn `:voucherCode` | Lấy thông tin chi tiết của 1 phiếu (ví dụ: `PT-0526-0001`). |
| **Tạo phiếu mới** | `POST` | `/vouchers` | Body: `CreateVoucherDto` | Lập phiếu thu/chi mới. Hệ thống tự sinh mã phiếu theo định dạng `PT/PC-MMYY-XXXX`. |
| **Cập nhật phiếu** | `PATCH` | `/vouchers/:voucherCode` | Body: `UpdateVoucherDto` | Sửa thông tin phiếu thu/chi (chỉ cho phép khi phiếu ở trạng thái `ACTIVE`). |
| **Hủy phiếu** | `PATCH` | `/vouchers/:voucherCode/cancel` | Không có | Hủy phiếu thu/chi. Hệ thống tự động chuyển trạng thái sang `CANCELED` và hoàn trừ (revert) số tiền đã thanh toán trên hóa đơn liên kết. |
| **Xóa phiếu** | `DELETE` | `/vouchers/:voucherCode` | Không có | Xóa hoàn toàn phiếu khỏi hệ thống. **Chỉ cho phép khi phiếu chưa liên kết với bất kỳ hóa đơn nào**. |

---

## 2. Giải Đáp & Thống Nhất Nghiệp Vụ BE ↔ FE

### 2.1. Quy tắc sinh mã Phiếu thu / Phiếu chi tự động
* Phiếu được tự động đánh số theo tháng/năm giao dịch và loại phiếu:
  * **Phiếu thu (RECEIPT):** Sinh mã bắt đầu bằng `PT-MMYY-XXXX` (ví dụ: `PT-0526-0001` cho phiếu thu thứ 1 trong tháng 05/2026).
  * **Phiếu chi (PAYMENT):** Sinh mã bắt đầu bằng `PC-MMYY-XXXX` (ví dụ: `PC-0526-0002`).
* **Lưu ý cho FE:** Trên giao diện, không cho người dùng tự nhập mã phiếu. Mã phiếu sẽ do Backend tự sinh và trả về trong trường `voucherCode` sau khi `POST` tạo thành công.

### 2.2. Quy tắc liên kết Hóa đơn (Invoices Linkage)
* Phiếu thu (`RECEIPT`) chỉ được phép liên kết với **Hóa đơn bán ra** (Outbound Invoice) qua trường `outboundInvoicePublicId`.
* Phiếu chi (`PAYMENT`) chỉ được phép liên kết với **Hóa đơn mua vào** (Inbound Invoice) qua trường `inboundInvoicePublicId`.
* **Cơ chế cập nhật trạng thái thanh toán tự động của BE:**
  * Khi tạo một phiếu thu/chi liên kết với hóa đơn có số tiền $A$, Backend sẽ cộng dồn số tiền này vào trường `paidAmount` của hóa đơn đó.
  * Nếu tổng số tiền của các phiếu liên kết cộng lại bằng đúng tổng tiền hóa đơn (`totalPayment` / `totalAmount`), hóa đơn sẽ tự động chuyển trạng thái `isPaid` sang `true`.
  * Nếu tổng số tiền vượt quá giá trị hóa đơn, API sẽ chặn và trả về lỗi `400 Bad Request`.

### 2.3. Ràng buộc Thuế đối với Chi phí giảm trừ (Deductible Expense Constraint)
Theo Luật Thuế Việt Nam hiện hành áp dụng cho các hộ kinh doanh:
* Đối với phiếu chi được đánh dấu là chi phí được giảm trừ thuế (`isDeductibleExpense: true`):
  * **Bắt buộc chuyển khoản nếu từ 5 triệu đồng trở lên:** Nếu số tiền phiếu chi $\ge 5.000.000$ VNĐ, phương thức thanh toán (`paymentMethod`) **bắt buộc phải là `BANK` (Chuyển khoản)**. 
  * Nếu người dùng chọn `CASH` (Tiền mặt) cho phiếu chi có giá trị từ 5 triệu trở lên, Backend sẽ chặn lại và trả về mã lỗi cụ thể:
    ```json
    {
      "statusCode": 400,
      "message": "Transactions of 5 million VND or more must be made via bank transfer.",
      "errorCode": "INVALID_TAX_DEDUCTIBLE_METHOD"
    }
    ```
  * **Phải liên kết hóa đơn:** Chi phí giảm trừ bắt buộc phải có hóa đơn chứng từ đi kèm. Vì vậy nếu `isDeductibleExpense: true`, FE bắt buộc phải gửi kèm mã `inboundInvoicePublicId`. Nếu thiếu, BE sẽ trả về mã lỗi `MISSING_INBOUND_INVOICE_DEDUCT`.

---

### 2.4. Phân biệt Cancel (Hủy phiếu) và Delete (Xóa phiếu)
* **Xóa phiếu (`DELETE /vouchers/:voucherCode`):**
  * Chỉ khả dụng khi phiếu thu/chi đó **chưa từng được liên kết** với hóa đơn mua/bán nào (cả `inboundInvoiceId` và `outboundInvoiceId` đều bằng `null`).
  * Giúp dọn dẹp các phiếu thu/chi tự do lập sai thông tin.
* **Hủy phiếu (`PATCH /vouchers/:voucherCode/cancel`):**
  * Dành cho các phiếu đã lập và đã liên kết thanh toán cho hóa đơn.
  * Khi thực hiện hủy phiếu, trạng thái phiếu chuyển sang `CANCELED`, đồng thời Backend tự động **trừ bớt số tiền đã trả** trên hóa đơn liên kết (`paidAmount` giảm tương ứng và chuyển trạng thái `isPaid` về `false`).

---

## 3. Cơ Chế Xử Lý Kỳ Thời Gian (`fromDate`)

Cả hai endpoint lấy danh sách và thống kê summary đều hỗ trợ tham số truy vấn `fromDate` đại diện cho một tháng hoặc một quý trong năm:

### 3.1. Định dạng `fromDate` được BE hỗ trợ (tự động parse linh hoạt)
* **Theo tháng:** `YYYY-MM` (ví dụ: `2026-05`), `MM-YYYY` (ví dụ: `05-2026`), hoặc `MM/YYYY`.
* **Theo quý:** `YYYY-Q#` (ví dụ: `2026-Q2`), `Q#-YYYY` (ví dụ: `Q2-2026`), hoặc `Q#/YYYY`.

### 3.2. Logic Thống kê Kỳ của `GET /vouchers/summary?fromDate=...`
Backend xác định mốc thời gian đầu kỳ (`startDate` - ngày 1 đầu tháng/quý) và cuối kỳ (`endDate` - ngày cuối tháng/quý) để thực hiện tổng hợp:
1. **`tong_tien_thu`**: Tổng số tiền của toàn bộ phiếu thu (`RECEIPT`) ở trạng thái hoạt động (`ACTIVE`) phát sinh **trong khoảng từ `startDate` đến `endDate`** (đúng trong tháng/quý đó).
2. **`tong_tien_chi`**: Tổng số tiền của toàn bộ phiếu chi (`PAYMENT`) ở trạng thái hoạt động (`ACTIVE`) phát sinh **trong khoảng từ `startDate` đến `endDate`** (đúng trong tháng/quý đó).
3. **`tien_mat`**: Số dư tiền mặt tích lũy của hộ kinh doanh (bằng Tổng tiền thu bằng `CASH` trừ đi Tổng tiền chi bằng `CASH`) phát sinh **từ `startDate` đến thời điểm hiện tại** (có thể âm nếu chi vượt thu).
4. **`tien_chuyen_khoan`**: Số dư tiền gửi ngân hàng tích lũy (bằng Tổng tiền thu bằng `BANK` trừ đi Tổng tiền chi bằng `BANK`) phát sinh **từ `startDate` đến thời điểm hiện tại** (có thể âm).

> [!TIP]
> **Hiệu năng cấp DB:** Toàn bộ quá trình tính toán trên đều sử dụng các truy vấn tổng hợp SQL (`Prisma.aggregate` và `Prisma.groupBy`) thực hiện trực tiếp trên cơ sở dữ liệu và trả về kết quả dạng số cuối cùng, tối ưu tối đa băng thông và bộ nhớ server.
