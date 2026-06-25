# Hướng Dẫn Tích Hợp & Giải Đáp Nghiệp Vụ Module Stocks (FE ↔ BE)

Tài liệu này hướng dẫn chi tiết cách tích hợp các API của module **Stocks (Quản lý kho - Phiếu nhập kho / Phiếu xuất kho)** cho Frontend (FE), đồng thời làm rõ các ràng buộc nghiệp vụ kế toán kho (tự động tạo phiếu xuất khi phát hành hóa đơn, đối chiếu hóa đơn mua vào với phiếu nhập, các quy tắc hủy/xóa phiếu, và kiểm soát kỳ kế toán).

---

## 1. Bản Đồ API Module Stocks (BE Contract)

Tất cả các API của module Stocks đều yêu cầu mã token đăng nhập (`JwtAuthGuard`) và được bảo vệ bởi `PeriodLockGuard` (chặn thay đổi khi kỳ kế toán đã đóng):

### 1.1. API Phiếu Nhập Kho (Stock Receipts)

- **Prefix Endpoint:** `/stock-receipts`

| Chức năng | Method | Endpoint | Query Parameters / Body | Mô tả & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Lấy danh sách** | `GET` | `/stock-receipts` | Query: `page`, `limit`, `sourceType` | Lấy danh sách phiếu nhập kho. `sourceType` lọc theo nguồn: `PURCHASE`, `PRODUCTION`, `ADJUSTMENT`, `OPENING`. |
| **Chi tiết phiếu & Đối chiếu** | `GET` | `/stock-receipts/:receiptCode` | Không có | Lấy thông tin chi tiết của 1 phiếu nhập kho kèm theo hóa đơn mua vào liên kết và các cảnh báo lệch đơn giá, số lượng. |
| **Tạo phiếu nhập** | `POST` | `/stock-receipts` | Body: `CreateStockReceiptDto` | Lập phiếu nhập kho mới. Hệ thống tự sinh mã phiếu theo định dạng `PNK-MMYY-XXXX`. |
| **Hủy phiếu nhập** | `PATCH` | `/stock-receipts/:receiptCode/cancel` | Không có | Hủy phiếu nhập kho. Hoàn trừ số lượng tồn kho và **tự động hủy toàn bộ các phiếu chi (Payment Vouchers)** liên kết với phiếu nhập kho này. |
| **Liên kết hóa đơn đầu vào** | `POST` | `/stock-receipts/:receiptCode/link-invoice` | Body: `invoicePublicId` | Tạo liên kết giữa phiếu nhập kho và hóa đơn đầu vào (`InboundInvoice`). BE tự động điều chỉnh đơn giá của phiếu nhập khớp với hóa đơn. |
| **Hủy liên kết hóa đơn** | `DELETE` | `/stock-receipts/:receiptCode/link-invoice/:invoicePublicId` | Không có | Xóa liên kết giữa phiếu nhập kho và hóa đơn đầu vào. |
| **Lấy hóa đơn đã liên kết** | `GET` | `/stock-receipts/:receiptCode/invoices` | Không có | Trả về danh sách các hóa đơn đầu vào đang liên kết với phiếu nhập kho này. |

### 1.2. API Phiếu Xuất Kho (Stock Issues)

- **Prefix Endpoint:** `/stock-issues`

| Chức năng | Method | Endpoint | Query Parameters / Body | Mô tả & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Lấy danh sách** | `GET` | `/stock-issues` | Query: `page`, `limit`, `sourceType` | Lấy danh sách phiếu xuất kho. `sourceType` lọc theo: `SALE`, `PRODUCTION`, `ADJUSTMENT`. |
| **Tạo phiếu xuất** | `POST` | `/stock-issues` | Body: `CreateStockIssueDto` | Lập phiếu xuất kho thủ công (ví dụ: Xuất hủy, xuất sản xuất). Hệ thống tự sinh mã `PXK-MMYY-XXXX`. |
| **Hủy phiếu xuất** | `PATCH` | `/stock-issues/:issueCode/cancel` | Không có | Hủy phiếu xuất kho và hoàn trả lại số lượng sản phẩm tương ứng vào tồn kho. |

### 1.3. API Tổng Quan Tồn Kho (Stock Summary)

- **Endpoint:** `GET /stocks/summary`
- **Mô tả:** Trả về thông số tổng hợp tình trạng kho trong kỳ hiện tại:
  - `endingInventoryValue`: Tổng trị giá hàng tồn kho cuối kỳ (tính theo phương pháp Bình quan gia quyền cuối kỳ).
  - `trackedItemsCount`: Tổng số mặt hàng đang được cấu hình theo dõi kho (`isInventoryTracked = true`).
  - `lowStockItemsCount`: Tổng số mặt hàng hữu hình có lượng tồn dưới ngưỡng tối thiểu (ngưỡng hệ thống mặc định là **15** sản phẩm).

---

## 2. Giải Đáp & Thống Nhất Nghiệp Vụ FE ↔ BE

### 2.1. Quy tắc sinh mã tự động & Ngày giao dịch
- Hệ thống tự động đánh số phiếu tăng dần theo tháng/năm giao dịch được chọn:
  - **Phiếu nhập kho:** Bắt đầu bằng `PNK-MMYY-XXXX` (ví dụ: `PNK-0626-0001`).
  - **Phiếu xuất kho:** Bắt đầu bằng `PXK-MMYY-XXXX` (ví dụ: `PXK-0626-0001`).
- **Thời gian giao dịch (`receiptDate` / `issueDate`):**
  > [!IMPORTANT]
  > Khi lập phiếu nhập/xuất, Frontend bắt buộc phải truyền thời gian giao dịch dạng ISO string trong body request. Hệ thống sẽ trích xuất `MMYY` từ trường này để tự sinh mã số phiếu, hỗ trợ hoàn toàn luồng ghi nhận lùi ngày (khác thời gian thực tế của server).

### 2.2. Phân loại loại bỏ Dịch vụ (Product Types)
- Chỉ các mặt hàng có cấu hình là sản phẩm hữu hình (`productType !== 'SERVICE'`) và được bật theo dõi kho (`isInventoryTracked = true`) mới được đưa vào phiếu nhập/xuất kho.
- Nếu người dùng cố tình đưa sản phẩm dịch vụ vào chứng từ kho, API sẽ chặn lại và trả về lỗi `400 Bad Request` (`PRODUCT_IS_SERVICE`).

### 2.3. Tự động Tạo Phiếu Xuất Kho khi Phát hành Hóa đơn
- Khi hóa đơn bán ra được phát hành thành công (`status` chuyển sang `PENDING_ISSUED` trong Phase 1), Backend sẽ **tự động khởi tạo một phiếu xuất kho** (`StockIssue` loại `SALE` và liên kết `sourceDocumentType = 'INVOICE'`) để xuất toàn bộ sản phẩm hữu hình có trong hóa đơn.
- **Ràng buộc:** Phiếu xuất kho chỉ tự động sinh ra cho các sản phẩm có theo dõi kho (`isInventoryTracked = true` và không phải dịch vụ). Nếu hóa đơn chỉ chứa toàn dịch vụ, hệ thống sẽ không sinh phiếu xuất kho.
- Nếu người dùng bấm phát hành lại hóa đơn bị lỗi (Retry publish), Backend sẽ kiểm tra xem đã có phiếu xuất kho liên kết chưa để tránh tạo trùng.

### 2.4. Luồng Liên kết Hóa đơn Mua vào (Inbound Invoice Linkage)
- Khác với phiếu chi, phiếu nhập kho (`StockReceipt`) có thể liên kết trực tiếp với hóa đơn đầu vào (`InboundInvoice`) nhằm phục vụ đối chiếu và cập nhật giá trị.
- **Cơ chế cập nhật giá trị tự động (Reconciliation Adjustment):**
  - Khi liên kết thành công (`POST /stock-receipts/:receiptCode/link-invoice`), Backend sẽ đối chiếu đơn giá (`unitCost`) của từng sản phẩm trên hóa đơn mua vào.
  - Nếu có chênh lệch đơn giá, Backend sẽ **tự động cập nhật lại đơn giá và trị giá của phiếu nhập kho cũng như bản ghi biến động kho (`InventoryMovement`) liên quan** theo đúng đơn giá trên hóa đơn đầu vào.
  - Sau đó, tổng tiền của phiếu nhập kho (`totalValue`) cũng được tính toán và cập nhật lại tương ứng.
  - Khi hủy liên kết (`DELETE`), Backend chỉ gỡ bỏ bản ghi liên kết, không hoàn trả lại đơn giá cũ trước khi liên kết.

### 2.5. Đối Chiếu Chứng Từ & Cảnh Báo Lệch (Document Reconciliation warnings)
- Nhằm tối giản hóa luồng nghiệp vụ và cho phép người dùng liên kết hóa đơn tự do, Backend đã loại bỏ hoàn toàn các cảnh báo chênh lệch đơn giá, số lượng và tổng tiền.
- API đối chiếu `GET /stock-receipts/:receiptCode` sẽ luôn trả về mảng cảnh báo `validation.warnings` là mảng rỗng và trạng thái `validation.status` là `"SUCCESS"`. Khác biệt về mặt giá trị hay số lượng giữa hóa đơn đầu vào và phiếu nhập kho được chấp nhận bình thường mà không gây ra bất kỳ cảnh báo nào.

### 2.6. Quy tắc Hủy Phiếu & Domino Effect lên Vouchers
- **Hủy phiếu nhập kho (`cancelReceipt`):**
  - Trạng thái phiếu nhập chuyển sang `CANCELLED`.
  - Tồn kho của các sản phẩm trong phiếu nhập sẽ được hoàn trừ (trừ bớt số lượng đã nhập).
  - **Domino Effect:** Toàn bộ các phiếu chi (`PAYMENT` vouchers) liên kết thanh toán với phiếu nhập kho này sẽ **tự động bị hủy** (`status` chuyển sang `CANCELED`).
- **Hủy phiếu xuất kho (`cancelIssue`):**
  - Trạng thái phiếu xuất chuyển sang `CANCELLED`.
  - Số lượng sản phẩm xuất đi sẽ được hoàn trả lại vào tồn kho của hộ kinh doanh.

### 2.7. Tự động Tạo Phiếu Chi khi Thanh toán Phiếu Nhập Kho (`isPaid`)
- Khi lập phiếu nhập kho (`POST /stock-receipts`), Frontend có thể truyền thuộc tính `isPaid: true` (mặc định là `false` nếu không truyền).
- Nếu `isPaid` là `true`, Backend sẽ tự động khởi tạo một phiếu chi (`Voucher` loại `PAYMENT`) liên kết với phiếu nhập kho này:
  - **Hạng mục chi:** Hệ thống tự động truy vấn danh mục chi cho Nguyên vật liệu (`systemTag: 'PAYMENT_MATERIAL'`).
  - **Phương thức thanh toán:** Chuyển khoản ngân hàng (`BANK`).
  - **Nội dung chi:** `"Thanh toán cho phiếu nhập kho <receiptCode>"`.
  - **Số tiền:** Bằng đúng tổng giá trị phiếu nhập kho (`totalValue`).
  - **Ngày lập phiếu chi:** Trùng khớp với ngày giao dịch phiếu nhập kho (`receiptDate`).
  - **Thông tin liên hệ:** Tên nhà cung cấp (`supplierName`).
- Đồng thời, trạng thái thanh toán của phiếu nhập kho cũng được cập nhật thành đã thanh toán (`isPaid = true` và `paidAmount = totalValue`).
- Ngoài ra, cả phiếu nhập kho (`StockReceipt`) và phiếu xuất kho (`StockIssue`) đều hỗ trợ trường ghi chú `note` để Frontend hiển thị và ghi nhận các lưu ý bổ sung từ người dùng.

---

## 3. Ràng Buộc Khóa Kỳ Kế Toán (`PeriodLockGuard`)

- Mọi thao tác ghi hoặc sửa đổi kho bao gồm: Tạo phiếu nhập/xuất, Hủy phiếu nhập/xuất, Liên kết hoặc Hủy liên kết hóa đơn đều được bảo vệ bởi `PeriodLockGuard`.
- Nếu kỳ kế toán của ngày giao dịch (`receiptDate` / `issueDate`) đã được đóng, tất cả các yêu cầu thay đổi sẽ bị chặn và trả về lỗi `403 Forbidden` (`PERIOD_LOCKED`).

---

## 4. Đặc Tả JSON Mẫu Cho FE Tích Hợp

### 4.1. Response GET /stocks/summary
```json
{
  "message": "Stock summary retrieved successfully",
  "data": {
    "endingInventoryValue": 125000000.5,
    "trackedItemsCount": 42,
    "lowStockItemsCount": 3
  }
}
```

### 4.2. Response GET /stock-receipts/:receiptCode (Reconciliation Detail)
```json
{
  "receipt": {
    "receiptCode": "PNK-0626-0001",
    "receiptDate": "2026-06-25T00:00:00.000Z",
    "sourceType": "PURCHASE",
    "supplierName": "Công ty Vật tư An Phát",
    "sourceInvoiceNo": "0001234",
    "totalValue": 50000000,
    "status": "APPROVED",
    "note": "Ghi chú phiếu nhập kho",
    "isPaid": true,
    "details": [
      {
        "productPublicId": "prod-101",
        "productName": "Thép cuộn phi 8",
        "quantity": 100,
        "unitCost": 500000,
        "totalValue": 50000000
      }
    ]
  },
  "invoice": {
    "publicId": "inv-inbound-999",
    "invoiceNo": "0001234",
    "supplierTaxCode": "0102030405",
    "totalAmount": 51000000,
    "details": [
      {
        "product": {
          "publicId": "prod-101"
        },
        "quantity": 100,
        "unitCost": 510000
      }
    ]
  },
  "validation": {
    "status": "SUCCESS",
    "warnings": []
  }
}
```
