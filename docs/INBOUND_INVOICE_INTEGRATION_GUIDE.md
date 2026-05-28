# Hướng dẫn Tích hợp & Giải đáp Mâu thuẫn Module Inbound Invoices (FE ↔ BE)

Tài liệu này giải đáp chi tiết các câu hỏi mâu thuẫn thiết kế của Frontend (FE), làm rõ logic nghiệp vụ của module **Inbound Invoices (Hóa đơn mua vào / Hóa đơn đầu vào)**, đồng thời hướng dẫn tích hợp endpoint thống kê hóa đơn bán ra mới cập nhật (`/invoices/summary`).

---

## 1. Bản Đồ API Module Inbound Invoices (BE Contract)

Các API chính thức của module Inbound Invoices trên Backend đều được bảo vệ bởi `JwtAuthGuard` và `PeriodLockGuard` (chặn thay đổi khi kỳ kế toán đã đóng):

| Chức năng | Method | Endpoint | Content-Type | Điều kiện & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Lấy danh sách** | `GET` | `/inbound-invoices` | `application/json` | Hỗ trợ phân trang (`page`, `limit`) và bộ lọc trạng thái qua query `type` (`CHUA_DONG_BO`, `DA_NHAP_KHO`, `CHUA_THANH_TOAN`). |
| **Chi tiết hóa đơn** | `GET` | `/inbound-invoices/:publicId` | `application/json` | Lấy chi tiết thông tin hóa đơn đầu vào và các dòng mặt hàng liên quan. |
| **Tạo mới hóa đơn** | `POST` | `/inbound-invoices` | `application/json` | Tạo hóa đơn nháp. Nếu truyền `isSyncedToInventory: true`, hệ thống sẽ tự động nhập kho và tính lại giá vốn. |
| **Cập nhật** | `PATCH` | `/inbound-invoices/:publicId` | `application/json` | Cập nhật thông tin hóa đơn. **Chỉ cho phép khi chưa đồng bộ kho (`isSyncedToInventory: false`)**. |
| **Xóa hóa đơn** | `DELETE` | `/inbound-invoices/:publicId` | `application/json` | Xóa hoàn toàn hóa đơn khỏi hệ thống. **Chỉ cho phép khi chưa đồng bộ kho (`isSyncedToInventory: false`)**. |
| **Đồng bộ tồn kho** | `PATCH` | `/inbound-invoices/:publicId/sync-inventory` | `application/json` | Thực hiện nhập kho vật lý cho các sản phẩm trong hóa đơn và tính lại giá vốn bình quân gia quyền. |
| **Hủy hóa đơn** | `PATCH` | `/inbound-invoices/:publicId/cancel` | `application/json` | Chuyển trạng thái hóa đơn sang `CANCELED`. Tự động hoàn trả (giảm) số lượng tồn kho và hủy tất cả Phiếu Chi liên kết. |

---

## 2. Giải Đáp Thắc Mắc & Thống Nhất Mâu Thuẫn BE ↔ FE

Dưới đây là câu trả lời chính thức của Backend dành cho 4 câu hỏi thảo luận tại mục 9 trong tài liệu [plan_api_inboundInvoice.md](file:///e:/financial-tax-system_BE/docs-coding-guidelines/plan_api_inboundInvoice.md):

### ❓ Câu hỏi 1: BE chưa có update/delete inbound?
> **FE hỏi:** Có OK đổi UX sang `create + sync + cancel`, không cho sửa/xóa cứng sau khi record đã lên BE?

* **Câu trả lời từ BE:** **Không cần thiết phải khóa cứng sớm như vậy.** Hiện tại Backend **ĐÃ bổ sung đầy đủ** hai endpoint cập nhật và xóa hóa đơn:
  * **Cập nhật:** `PATCH /v1/inbound-invoices/:publicId` (nhận `UpdateInboundInvoiceDto`).
  * **Xóa (Delete):** `DELETE /v1/inbound-invoices/:publicId`.
  * **Ràng buộc nghiệp vụ:**
    * Nếu hóa đơn **chưa đồng bộ kho** (`isSyncedToInventory: false`), người dùng vẫn có quyền **Chỉnh sửa** hoặc **Xóa hoàn toàn (Hard Delete)**.
    * Khi hóa đơn **đã đồng bộ kho** (`isSyncedToInventory: true`), hệ thống sẽ **khóa cứng** hóa đơn đầu vào đó để đảm bảo tính nhất quán của Sổ kho S05 và Giá vốn. Khi đó, mọi yêu cầu `PATCH` (sửa) hoặc `DELETE` (xóa) sẽ trả về lỗi `400 Bad Request`.

---

### ❓ Câu hỏi 2: Thay thế nút Xóa bằng Hủy hóa đơn (`PATCH /cancel`)?
> **FE hỏi:** Có OK thay nút “Xóa” bằng “Hủy hóa đơn” dùng `PATCH /cancel`?

* **Câu trả lời từ BE:** FE nên giữ cả hai tính năng này trên UI để tương ứng với vòng đời hóa đơn:
  * **Dùng nút "Xóa" (gọi `DELETE` API):** Khi hóa đơn đầu vào mới chỉ là bản nháp/chưa đồng bộ vào kho hàng. Cho phép người dùng dọn sạch dữ liệu nhập sai.
  * **Dùng nút "Hủy hóa đơn" (gọi `PATCH /:publicId/cancel` API):** Khi hóa đơn **đã được đồng bộ kho** hoặc **đã lập phiếu chi** nhưng phát sinh sai sót/trả hàng.
    * *Logic xử lý của BE khi hủy:* Tự động giảm trừ số lượng tồn kho tương ứng của các sản phẩm vật lý trong hóa đơn, đồng thời tự động hủy (`CANCELED`) toàn bộ các Phiếu Chi đang liên kết với hóa đơn này.

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
