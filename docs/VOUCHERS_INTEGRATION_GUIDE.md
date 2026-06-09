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
* **Thời gian giao dịch (`transactionAt`):**
  > [!IMPORTANT]
  > Khi lập phiếu thu/chi, Frontend bắt buộc phải truyền trường `transactionAt` (định dạng Date ISO string) trong body request. Hệ thống sẽ sử dụng mốc thời gian này làm ngày giao dịch chính thức của phiếu và dùng nó để trích xuất `MMYY` tự động tạo mã phiếu. Không còn lấy thời gian hiện tại (`new Date()`) trên server.
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

---

## 4. 📢 Phản Hồi & Hướng Dẫn Tích Hợp Cho Frontend (Theo Kế Hoạch B1)

Dựa trên tài liệu kế hoạch tích hợp [plan_api_voucher (1).md](file:///e:/financial-tax-system_BE/docs-coding-guidelines/plan_api_voucher%20%281%29.md) từ Frontend, Backend xác nhận các điểm thống nhất và hướng dẫn điều chỉnh các điểm mâu thuẫn như sau:

### 4.1. Cập nhật bắt buộc: Ngưỡng kiểm soát chi phí được trừ
* **Mâu thuẫn:** Trong tài liệu của FE ghi nhận ngưỡng chuyển khoản là **20 triệu VNĐ** (`amount > 20_000_000`).
* **Quy tắc thực tế trên BE:** **FE cần sửa lại ngưỡng kiểm tra này thành từ 5 triệu VNĐ trở lên (`amount >= 5_000_000`).**
  * Theo nghiệp vụ thuế áp dụng cho hộ kinh doanh của hệ thống, bất kỳ phiếu chi nào được đánh dấu là chi phí giảm trừ thuế (`isDeductibleExpense: true`) có số tiền từ **5.000.000 VNĐ trở lên** đều **bắt buộc** phải chọn phương thức thanh toán là `BANK` (chuyển khoản). 
  * Nếu chọn `CASH` (tiền mặt), Backend sẽ chặn và trả về lỗi `INVALID_TAX_DEDUCTIBLE_METHOD`. Do đó, FE cần sửa lại message lỗi trên UI/Validator thành: *“Giao dịch từ 5 triệu VNĐ trở lên phải chuyển khoản để được tính chi phí hợp lý.”*

### 4.2. Bổ sung trường người liên hệ (`contactName`)
* **Thống nhất:** Backend **ĐÃ cập nhật** trường `contactName` (kiểu dữ liệu `String?`) vào model `Voucher` trong DB và các DTOs.
  * **Khi tạo/cập nhật phiếu:** FE gửi trường `contactName` trong body request (ví dụ: `"contactName": "Nguyễn Văn A"`). Trường này là tùy chọn (Optional).
  * **Khi lấy thông tin (GET):** Tất cả các API trả về của Voucher đều trả về trường `contactName` trong object dữ liệu (nếu không có sẽ là `null`). FE có thể map trực tiếp sang trường `"Thu từ/Chi cho"` trên UI.

### 4.3. Phân loại chi phí S2c (`s2cExpenseMapping` / `s2c_expense_mapping`)
* **Thống nhất:** Backend **ĐÃ chuyển đổi** toàn bộ logic tính toán Sổ chi phí S2c-HKD sang sử dụng trường phân loại `s2cExpenseMapping` trong bảng `VoucherCategory` thay vì lọc theo tên cứng như trước.
* **Cấu trúc Enum `s2cExpenseMapping`:**
  * `ITEM_A`: Nguyên vật liệu (Mục a)
  * `ITEM_B`: Lương, bảo hiểm (Mục b)
  * `ITEM_C`: Khấu hao (Mục c)
  * `ITEM_D`: Dịch vụ mua ngoài (Mục d)
  * `ITEM_E`: Lãi vay (Mục đ)
  * `ITEM_F`: Chi khác (Mục e)
  * `NONE`: Phiếu thu hoặc chi tiêu cá nhân không được tính vào chi phí hợp lý.
* **Giao diện & DTO:**
  * Trình phản hồi DTO của danh mục (`VoucherCategoryResponseDto`) sẽ trả về trường `s2cExpenseMapping` để FE sử dụng cho việc gom nhóm hoặc hiển thị.
  * Khi người dùng tạo một danh mục chi tiêu mới (`type === 'PAYMENT'`), nếu FE không truyền `s2cExpenseMapping`, Backend sẽ tự động gán giá trị mặc định là `ITEM_F` (Chi khác). Nếu là hạng mục thu (`type === 'RECEIPT'`), mặc định là `NONE`.

### 4.4. Thời gian giao dịch (`transactionAt`)
* **Thống nhất:** FE sẽ tổng hợp ngày (`transaction_date`) và giờ (`transaction_time`) được chọn trên UI thành một chuỗi Date ISO 8601 và gửi lên trường `transactionAt` của API tạo/sửa phiếu.
* Backend sẽ lấy trực tiếp mốc thời gian này làm ngày ghi nhận giao dịch của phiếu, đồng thời dùng nó để trích xuất tháng/năm tự động đánh số mã phiếu (ví dụ: `PC-0526-XXXX` cho ngày giao dịch trong tháng 05/2026), hỗ trợ hoàn toàn việc ghi nhận lùi ngày/khác ngày hiện tại.

### 4.5. Ánh xạ trạng thái và khóa các trường khi sửa phiếu (Update Voucher)
* **Status Mapping:** Hoàn toàn nhất trí với giải pháp Frontend mapper:
  * Trạng thái `ACTIVE` ở BE sẽ được FE map thành `COMPLETED` để hiển thị trên UI.
  * Trạng thái `CANCELED` giữ nguyên là `CANCELED`.
* **Khóa các trường khi chỉnh sửa phiếu (Update Validation):**
  * **Trường hợp Phiếu đã liên kết hóa đơn** (khi `inboundInvoiceId !== null` hoặc `outboundInvoiceId !== null`):
    * Bắt buộc khóa (disable) các trường tránh làm sai lệch đối chiếu thanh toán: `voucherType` (Loại phiếu), `amount` (Số tiền), `inboundInvoicePublicId` (Hóa đơn mua vào), `outboundInvoicePublicId` (Hóa đơn bán ra), và `isDeductibleExpense` (Chi phí hợp lý). Người dùng chỉ được cập nhật các trường thông tin cơ bản (Diễn giải, Danh mục chi phí cùng loại, Phương thức thanh toán, Người liên hệ, Thời gian giao dịch).
  * **Trường hợp Phiếu chưa liên kết hóa đơn** (chưa thanh toán cho hóa đơn nào):
    * Cho phép sửa đổi toàn bộ các trường, kể cả `voucherType`, `amount`, `isDeductibleExpense`, và các liên kết hóa đơn.
    * Đặc biệt: Nếu phiếu chi được đánh dấu là chi phí giảm trừ thuế (`isDeductibleExpense: true`) nhưng **chưa thực hiện liên kết** với hóa đơn mua vào nào, hệ thống **vẫn cho phép lưu trữ và chỉnh sửa toàn bộ bình thường** chứ không chặn lỗi thiếu hóa đơn (`MISSING_INBOUND_INVOICE_DEDUCT` chỉ kiểm soát khi có hành vi liên kết thực tế).
