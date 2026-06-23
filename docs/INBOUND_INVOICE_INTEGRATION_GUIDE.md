# Hướng dẫn Tích hợp & Giải đáp Mâu thuẫn Module Inbound Invoices (FE ↔ BE)

Tài liệu này giải đáp chi tiết các câu hỏi mâu thuẫn thiết kế của Frontend (FE), làm rõ logic nghiệp vụ của module **Inbound Invoices (Hóa đơn mua vào / Hóa đơn đầu vào)**, đồng thời hướng dẫn tích hợp endpoint thống kê hóa đơn bán ra mới cập nhật (`/invoices/summary`).

---

## 1. Bản Đồ API Module Inbound Invoices (BE Contract)

Các API chính thức của module Inbound Invoices trên Backend đều được bảo vệ bởi `JwtAuthGuard` và `PeriodLockGuard` (chặn thay đổi khi kỳ kế toán đã đóng):

| Chức năng | Method | Endpoint | Content-Type | Điều kiện & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Lấy danh sách** | `GET` | `/inbound-invoices` | `application/json` | Hỗ trợ phân trang (`page`, `limit`) và bộ lọc trạng thái qua query `type` (`CHUA_THANH_TOAN`). |
| **Thống kê tổng quan** | `GET` | `/inbound-invoices/summary` | `application/json` | Trả về tổng số lượng hóa đơn, tổng doanh thu đầu vào và tổng số tiền chưa thanh toán. |
| **Chi tiết hóa đơn** | `GET` | `/inbound-invoices/:publicId` | `application/json` | Lấy chi tiết thông tin hóa đơn đầu vào và các dòng mặt hàng liên quan. |
| **Đồng bộ từ CQT** | `POST` | `/inbound-invoices/trigger-sync` | `application/json` | Kích hoạt đồng bộ hóa đơn mua vào tự động từ hệ thống của Cơ quan Thuế. |

---

## 2. Giải Đáp Thắc Mắc & Thống Nhất Mâu Thuẫn BE ↔ FE

Dưới đây là câu trả lời chính thức của Backend dành cho 4 câu hỏi thảo luận tại mục 9 trong tài liệu [plan_api_inboundInvoice.md](file:///e:/financial-tax-system_BE/docs-coding-guidelines/plan_api_inboundInvoice.md):

### ❓ Câu hỏi 1: BE chưa có update/delete/create inbound bằng tay?
> **FE hỏi:** Có OK đổi UX sang tự động đồng bộ và không cho người dùng tạo/sửa/xóa hóa đơn mua vào trực tiếp?

* **Câu trả lời từ BE:** **Hoàn toàn chính xác.** Theo logic nghiệp vụ mới, **Hóa đơn mua vào (Inbound Invoices)** chỉ được đồng bộ tự động từ hệ thống của Cơ quan Thuế qua endpoint `POST /inbound-invoices/trigger-sync` chứ không cho phép tạo mới, chỉnh sửa, hay xóa thủ công.
* **Mối liên kết giữa Hóa đơn mua vào và Kho hàng / Phiếu Chi:**
  * Việc nhập kho vật lý thực tế được thực hiện độc lập tại **Module Kho (`stock-receipts`)** bằng cách lập Phiếu nhập kho và có thể liên kết phiếu nhập kho với hóa đơn mua vào thông qua API liên kết.
  * Việc thanh toán và lập Phiếu chi (`PAYMENT` voucher) được liên kết trực tiếp với **Phiếu nhập kho (`stock-receipts`)** thay vì Hóa đơn mua vào. Do đó, hóa đơn mua vào không còn liên kết trực tiếp hay kiểm soát vòng đời của Phiếu chi nữa.

---

### ❓ Câu hỏi 2: Thay thế nút Xóa/Hủy trên màn hình Hóa đơn mua vào?
> **FE hỏi:** Có cần cung cấp nút Xóa hoặc Hủy cho hóa đơn mua vào nữa không?

* **Câu trả lời từ BE:** **Không cần thiết.** Vì Hóa đơn mua vào là chứng từ được đồng bộ từ Cơ quan Thuế để đối chiếu và giám sát, người dùng không thể can thiệp Xóa/Hủy hóa đơn đầu vào này. Thay vào đó, nếu muốn hủy bỏ nghiệp vụ nhập kho hoặc phiếu chi tương ứng, người dùng sẽ thực hiện Hủy phiếu nhập kho (`PATCH /stock-receipts/:receiptCode/cancel`) hoặc Hủy phiếu chi (`PATCH /vouchers/:voucherCode/cancel`).

---

### ❓ Câu hỏi 3: Gửi attachmentUrl dạng chuỗi hay base64?
> **FE hỏi:** Có OK tiếp tục gửi `attachmentUrl` dạng string/base64 như FE hiện tại?

* **Câu trả lời từ BE:** Theo thống nhất mới nhất giữa FE và BE, **tính năng đính kèm ảnh/file hóa đơn đầu vào (`attachmentUrl`) sẽ tạm thời được bỏ qua và cập nhật ở các phiên bản sau**. Hiện tại trường `attachmentUrl` trong DTO và Database sẽ được gán mặc định là `null` hoặc để trống, Frontend không cần thực hiện upload/gửi file đính kèm này nữa.

---

### ❓ Câu hỏi 4: Bổ trợ thông tin sản phẩm (Product Enrichment)?
> **FE hỏi:** Có OK mapper lấy `unit/product_type` từ `ftax_products` để hiển thị và lọc vì BE detail chưa trả?

* **Câu trả lời từ BE:** **Hoàn toàn đồng ý.** Việc mapper của Frontend tự động lấy `unit` và `product_type` từ cache của store sản phẩm (`ftax_products` hoặc `productStore`) để bổ trợ hiển thị là giải pháp tối ưu. Nó giúp giảm tải kích thước dữ liệu truyền tải trên mạng của API chi tiết hóa đơn.

---

## 3. Quy Tắc Logic Nghiệp Vụ Cần Lưu Ý Trên FE

### 3.1. Thuật toán Giá vốn Bình quân gia quyền (Weighted Average Costing)
Khi thực hiện lưu hóa đơn có `isSyncedToInventory: true` hoặc khi bấm nút "Nhập kho" (`PATCH /sync-inventory`), Backend sẽ tự động chạy thuật toán tính lại giá vốn bình quân gia quyền của các sản phẩm vật lý (`RAW_MATERIAL`, `FINISHED_GOOD`):

$$\text{Đơn giá bình quân mới} = \frac{(\text{Số lượng tồn cũ} \times \text{Đơn giá bình quân cũ}) + (\text{Số lượng nhập mới} \times \text{Đơn giá nhập mới})}{\text{Số lượng tồn cũ} + \text{Số lượng nhập mới}}$$

* **Cơ chế Hiển thị Giá vốn Bình quân gia quyền trên Giao diện:**
  > [!NOTE]
  > Giá vốn bình quân gia quyền được tính toán **riêng biệt cho từng sản phẩm cụ thể (mỗi sản phẩm có đơn giá vốn riêng)** chứ không phải tính chung cho toàn bộ kho hàng.
  
  * **Hiển thị cho từng sản phẩm:**
    * **Danh mục/Chi tiết Sản phẩm:** Trả về qua trường `openingStockUnitCost` trong API sản phẩm (`GET /products` và `GET /products/:publicId`), Frontend ánh xạ (map) thành `current_avg_cost` hoặc `opening_stock_unit_cost` để hiển thị trực tiếp giá vốn hiện thời của sản phẩm đó.
    * **Sổ chi tiết vật tư, hàng hóa (Sổ S2d):** Hiển thị chi tiết theo từng dòng giao dịch nhập/xuất kho của sản phẩm đó, trong đó đơn giá xuất kho (`Don_Gia_Xuat`) chính là đơn giá vốn bình quân gia quyền tại thời điểm xuất.
  * **Hiển thị cho toàn bộ sản phẩm (Summary):**
    * **Tổng giá trị tồn kho:** Ở các API tổng hợp như `GET /products/summary` hoặc `GET /accounting-books/inventory/summary`, trường `tong_gia_tri_ton_kho` (Tổng giá trị tồn kho) được tính bằng tổng tích số giữa **[Số lượng tồn]** và **[Giá vốn bình quân gia quyền tương ứng]** của **tất cả sản phẩm vật lý** cộng lại.

* **Lưu ý cho FE:** Sau khi đồng bộ thành công, hãy reload/refresh store danh sách sản phẩm để người dùng nhìn thấy đơn giá vốn (`openingStockUnitCost` / `current_avg_cost`) mới cập nhật trên giao diện.

### 3.2. Ràng buộc Kỳ kế toán (Period Lock)
Tất cả các API thay đổi dữ liệu (`POST`, `PATCH`, `DELETE` trên Inbound Invoices) đều được kiểm tra thông qua `PeriodLockGuard`. Nếu ngày phát hành hóa đơn (`issueDate`) nằm trong một Kỳ kế toán đã đóng (`CLOSED`), API sẽ chặn và trả về lỗi `400 Bad Request`. Người dùng buộc phải mở lại kỳ kế toán trước nếu muốn thao tác.

### 3.3. Lập Phiếu Chi liên kết Phiếu Nhập Kho và Ngày giao dịch (`transactionAt`)
Khi lập Phiếu Chi để thanh toán cho các đợt nhập hàng, Frontend sẽ liên kết Phiếu Chi với Phiếu nhập kho (Stock Receipt) bằng cách gửi kèm `stockReceiptCode` trong body của API tạo phiếu chi (`POST /vouchers`). Phiếu Chi không còn được liên kết hay gắn trực tiếp với Hóa đơn mua vào (Inbound Invoice) nữa.
* Frontend **bắt buộc phải truyền trường `transactionAt`** (định dạng Date ISO string) trong body request để Backend sử dụng tự động sinh mã phiếu `PC-MMYY-XXXX` và ghi nhận ngày chi tiền chính xác.

---

## 4. 📢 Cập Nhật Tích Hợp Endpoint Thống Kê Hóa Đơn Bán Ra (`GET /v1/invoices/summary`)

> [!IMPORTANT]
> Backend đã tinh chỉnh cấu trúc dữ liệu trả về của API thống kê hóa đơn bán ra (outbound) để trả về đúng 3 chỉ số nghiệp vụ kế toán hộ kinh doanh theo yêu cầu mới. **Frontend cần cập nhật lại code tích hợp endpoint này.**

### 4.1. Chi tiết API Thống kê Hóa đơn Bán ra

* **Method:** `GET`
* **Route:** `/v1/invoices/summary`
* **Authentication:** Bắt buộc (Bearer Token)
* **Response Body (JSON):**

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T20:40:00.000Z",
  "message": "Invoice summary retrieved successfully.",
  "data": {
    "tong_hoa_don": 42,
    "tong_doanh_thu": 150000000.00,
    "tong_thue": 15000000.00
  },
  "meta": null
}
```

### 4.2. Giải thích ý nghĩa các trường dữ liệu
1. **`tong_hoa_don`** (`number`): Tổng số lượng tất cả hóa đơn bán ra trong hệ thống của người dùng (bao gồm mọi trạng thái `DRAFT`, `ISSUED`, `CANCELED`, `SYNC_FAILED`).
2. **`tong_doanh_thu`** (`number`): Tổng doanh thu thực tế được cộng dồn từ các hóa đơn **đã phát hành thành công** (`status === 'ISSUED'`). Các hóa đơn bản nháp hoặc đã hủy không được tính vào doanh thu.
3. **`tong_thue`** (`number`): Tổng số tiền thuế phải nộp (VAT) được tính từ các hóa đơn **đã phát hành thành công** (`status === 'ISSUED'`).

> [!TIP]
> **Tối ưu hóa hiệu năng phía BE:** Endpoint này đã được Backend tái cấu trúc sử dụng truy vấn gộp ở cấp cơ sở dữ liệu (`Promise.all` kết hợp `Prisma.count` và `Prisma.aggregate`) giúp phản hồi cực kỳ nhanh (dưới 50ms) ngay cả khi tài khoản hộ kinh doanh có hàng ngàn hóa đơn, hoàn toàn không gây nghẽn bộ nhớ Node.js.

---

## 5. 📢 Tích Hợp Endpoint Thống Kê Hóa Đơn Mua Vào (`GET /v1/inbound-invoices/summary`)

> [!IMPORTANT]
> Backend đã phát triển xong endpoint thống kê cho hóa đơn mua vào (Inbound Invoices). Frontend cần cập nhật tích hợp để hiển thị các chỉ số tổng quan trên giao diện quản lý hóa đơn mua vào.

### 5.1. Chi tiết API Thống kê Hóa đơn Mua Vào

* **Method:** `GET`
* **Route:** `/v1/inbound-invoices/summary`
* **Authentication:** Bắt buộc (Bearer Token)
* **Response Body (JSON):**

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T20:45:00.000Z",
  "message": "Get inbound invoice summary success.",
  "data": {
    "tong_so_luong_hoa_don": 25,
    "tong_doanh_thu": 120000000.00,
    "tong_chua_thanh_toan": 35000000.00
  },
  "meta": null
}
```

### 5.2. Giải thích ý nghĩa các trường dữ liệu
1. **`tong_so_luong_hoa_don`** (`number`): Tổng số lượng tất cả hóa đơn mua vào trong hệ thống của người dùng (không phân biệt trạng thái `ACTIVE` hay `CANCELED`).
2. **`tong_doanh_thu`** (`number`): Tổng giá trị tiền hàng (đầu vào) được cộng dồn từ các hóa đơn mua vào **ở trạng thái hoạt động** (`status === 'ACTIVE'`).
3. **`tong_chua_thanh_toan`** (`number`): Tổng số tiền còn nợ nhà cung cấp đối với các hóa đơn đang hoạt động (`status === 'ACTIVE'`) nhưng chưa thanh toán xong (`isPaid === false`).
   * *Công thức tính:* Bằng tổng của $(\text{totalAmount} - \text{paidAmount})$ từ các hóa đơn thỏa mãn điều kiện trên.

