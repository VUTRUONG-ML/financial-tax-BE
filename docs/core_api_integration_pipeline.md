# Hướng Dẫn Luồng Kiểm Thử Tích Hợp API Lõi (Core API Integration Pipeline)

Tài liệu này hướng dẫn chi tiết quy trình 4 bước để kiểm thử tích hợp toàn bộ hệ thống tài chính thuế (Financial Tax System), từ định danh, cấu hình công cụ thuế, quản lý danh mục hàng hóa/tồn kho đầu kỳ, cho đến kích hoạt luồng nghiệp vụ sinh thuế thông qua hóa đơn mua vào/bán ra.

---

## 3 Tài Khoản Kiểm Thử Chuẩn Bị Sẵn (Pre-seeded Accounts)

Hệ thống đã được seed sẵn 3 tài khoản tương ứng với 3 nhóm thuế (`tax_groups`) trong cơ sở dữ liệu. Cả 3 tài khoản đều **chưa hoàn thành onboarding** để người kiểm thử có thể thực hiện trọn vẹn từ Bước 1 đến Bước 4.

| Tài khoản (Phone) | Mật khẩu | Mới số thuế | Nhóm Thuế | Mô tả Nhóm Thuế |
| :--- | :--- | :--- | :--- | :--- |
| `0900000001` | `Password123!` | `0123456781` | **Mức 1: Miễn thuế** | Doanh thu < 500tr/năm. Phương pháp áp dụng mặc định: `EXEMPT` (Miễn thuế). |
| `0900000002` | `Password123!` | `0123456782` | **Mức 2: Nhóm linh hoạt** | Doanh thu 500tr - 3 tỷ/năm. Hỗ trợ so sánh AI giữa `% doanh thu` (`PERCENTAGE`) và `15% lợi nhuận` (`PROFIT_15`). |
| `0900000003` | `Password123!` | `0123456783` | **Mức 3: Bắt buộc lợi nhuận** | Doanh thu 3 tỷ - 50 tỷ/năm. Phương pháp áp dụng bắt buộc: `PROFIT_17` (17% lợi nhuận). |

> [!NOTE]
> * Nhóm thuế thứ 4 (Doanh thu > 50 tỷ/năm, bắt buộc `PROFIT_20`) cũng có cấu trúc tương tự Nhóm 3.
> * Các tài khoản trên được cập nhật tự động khi chạy lệnh: `pnpm db:seed`

---

## BƯỚC 1: Khởi Tạo Định Danh & Xác Thực (Module A1 - Auth)

Người dùng thực hiện đăng nhập để lấy mã thông báo truy cập JWT (`accessToken`). Mã này sẽ được gửi trong header `Authorization: Bearer <token>` của tất cả các request tiếp theo.

### 1. API Đăng nhập (Login)
* **Endpoint**: `POST /v1/auth/login`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "phoneNumber": "0900000002",
  "password": "Password123!"
}
```

* **Response Example (200 OK)**:
```json
{
  "message": "Login success.",
  "data": {
    "user": {
      "id": "cmo6otuzj0000x8pfmslfk6ct",
      "phoneNumber": "0900000002",
      "role": "ADMIN",
      "taxCode": "0123456782",
      "businessName": "Hộ kinh doanh Nhóm Hai (So sánh AI)",
      "ownerName": "Nguyễn Văn Linh Hoạt",
      "cccdNumber": "001090000002",
      "provinceCity": "Hồ Chí Minh",
      "isActive": true,
      "setUpCompletedAt": null,
      "createdAt": "2026-05-20T14:25:27.000Z",
      "updatedAt": "2026-05-20T14:25:27.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "494a739f-32c9-412e-b8ea-74207ca80861..."
  }
}
```

---

## BƯỚC 2: Cấu Hình Hồ Sơ & Bộ Máy Thuế (Module A2 - Onboarding)

Mục đích của bước này là thiết lập ngành nghề kinh doanh và phân nhóm thuế để hệ thống cấu hình tỷ lệ thuế suất snapshot và khởi tạo kỳ tài chính đầu tiên (`FinancialPeriod`).

* **Endpoint**: `POST /v1/onboarding/tax-config`
* **Headers**:
  * `Content-Type: application/json`
  * `Authorization: Bearer <accessToken>`
* **Logic Chọn tham số**:
  * `industryId`: Chọn `1` đại diện cho thẻ gợi ý "Tạp hóa - Siêu thị mini" (đã được map sang nhóm thuế phân phối hàng hóa: VAT 1%, PIT 0.5%).
  * `taxGroupId`: Khai báo nhóm doanh thu của hộ kinh doanh (1, 2, hoặc 3).
  * `pitMethod`: Phương pháp tính thuế TNCN. Hệ thống sẽ kiểm tra tính hợp lệ của phương pháp chọn đối với nhóm thuế đã cấu hình.

### Request ví dụ cho User 2 (Nhóm 2 - Linh hoạt so sánh AI)
```json
{
  "industryId": 1,
  "taxGroupId": 2,
  "pitMethod": "PERCENTAGE",
  "isOtherIndustry": false
}
```

* **Response Example (201 Created)**:
```json
{
  "message": "Set up tax configuration success.",
  "data": {
    "id": "cmo6ovwz20002x8pf12345678",
    "userId": "cmo6otuzj0000x8pfmslfk6ct",
    "industryId": 1,
    "taxGroupId": 2,
    "chosenPitMethod": "PERCENTAGE",
    "applyFromDate": "2026-05-20T00:00:00.000Z",
    "applyToDate": "9999-12-31T00:00:00.000Z",
    "vatRateSnapShot": "0.0100",
    "pitRateSnapShot": "0.0050",
    "isVatReducible": false,
    "vatFilingPeriod": "QUARTERLY",
    "createdAt": "2026-05-20T14:26:00.000Z",
    "updatedAt": "2026-05-20T14:26:00.000Z"
  }
}
```

> [!TIP]
> **Cơ chế Bảo vệ Onboarding:**
> 1. Nếu thực hiện gọi lại API cấu hình trên một tài khoản đã Onboarding, hệ thống sẽ chặn bằng lỗi `409 Conflict` (`This account has completed onboarding. It cannot be done again.`).
> 2. Việc thay đổi cấu hình thuế sau này phải thực hiện qua `PUT /v1/onboarding/tax-config` và chịu ràng buộc giãn cách tối thiểu 90 ngày (`TAX_QUARTER_COOLDOWN`).

---

## BƯỚC 3: Thiết Lập Danh Mục Sản Phẩm & Tồn Kho Đầu Kỳ (Module A3)

> [!IMPORTANT]
> **Ràng buộc nghiệp vụ:**
> Không thể lập hóa đơn bán ra (Outbound Invoice) hay hóa đơn mua vào (Inbound Invoice) nếu không khai báo thông tin sản phẩm và tồn kho đầu kỳ. Hàng hóa trong hóa đơn bắt buộc phải liên kết tới một sản phẩm hợp lệ thông qua `productPublicId`.

API Sản phẩm sử dụng định dạng dữ liệu `multipart/form-data` để phục vụ khả năng tải ảnh sản phẩm lên hệ thống Cloudinary.

* **Endpoint**: `POST /v1/products`
* **Headers**:
  * `Content-Type: multipart/form-data; boundary=----FormBoundaryXYZ`
  * `Authorization: Bearer <accessToken>`
* **Request Body (form-data)**:
  * `productName`: Cà phê Arabica
  * `skuCode`: CF-ARA-001 (Mã quản lý kho)
  * `productType`: `FINISHED_GOOD` (Thành phẩm) hoặc `RAW_MATERIAL` (Nguyên vật liệu) hoặc `SERVICE` (Dịch vụ)
  * `unit`: Kg
  * `sellingPrice`: 250000 (Giá bán đề xuất)
  * `openingStockQuantity`: 100 (Số lượng tồn kho đầu kỳ)
  * `openingStockUnitCost`: 150000 (Đơn giá vốn đầu kỳ)

* **cURL Command ví dụ**:
```bash
curl --location 'http://localhost:3000/v1/products' \
--header 'Authorization: Bearer <accessToken>' \
--form 'productName="Cà phê Arabica"' \
--form 'skuCode="CF-ARA-001"' \
--form 'productType="FINISHED_GOOD"' \
--form 'unit="Kg"' \
--form 'sellingPrice="250000"' \
--form 'openingStockQuantity="100"' \
--form 'openingStockUnitCost="150000"'
```

* **Response Example (201 Created)**:
```json
{
  "message": "Create product success.",
  "data": {
    "id": 1,
    "publicId": "cmo6p1xyz0003x8pf77777777",
    "userId": "cmo6otuzj0000x8pfmslfk6ct",
    "skuCode": "CF-ARA-001",
    "productName": "Cà phê Arabica",
    "productType": "FINISHED_GOOD",
    "unit": "Kg",
    "sellingPrice": "250000.0000",
    "openingStockQuantity": 100,
    "openingStockUnitCost": "150000.0000",
    "openingStockValue": "15000000.0000",
    "currentStock": 100,
    "createdAt": "2026-05-20T14:27:00.000Z",
    "updatedAt": "2026-05-20T14:27:00.000Z"
  }
}
```

> [!NOTE]
> Lưu lại giá trị `"publicId"` (Ví dụ: `cmo6p1xyz0003x8pf77777777`) trong response để sử dụng làm mã sản phẩm tại Bước 4.

---

## BƯỚC 4: Kích Hoạt Luồng Nghiệp Vụ Sinh Thuế

Bước này mô phỏng hoạt động giao dịch thực tế sinh ra thuế GTGT & TNCN phải nộp và thay đổi số lượng tồn kho của doanh nghiệp.

### PHÂN LUỒNG A: Hóa Đơn Bán Ra (Outbound Invoice)

Lập hóa đơn bán hàng cho khách hàng lẻ (B2C) hoặc doanh nghiệp (B2B).

#### 1. Tạo hóa đơn DRAFT bán lẻ (B2C)
* **Endpoint**: `POST /v1/invoices`
* **Headers**:
  * `Content-Type: application/json`
  * `Authorization: Bearer <accessToken>`
* **Request Body**:
```json
{
  "isB2C": true,
  "paymentMethod": "CASH",
  "details": [
    {
      "productPublicId": "cmo6p1xyz0003x8pf77777777",
      "quantity": 5
    }
  ]
}
```
* **Response Example (201 Created)**:
```json
{
  "message": "Create invoice success.",
  "data": {
    "publicId": "cmo6p5abc0004x8pfaaaaaaaa",
    "invoiceSymbol": "2C26TAA",
    "totalPayment": "1250000.0000",
    "taxRate": "0.0100",
    "taxPayable": "12500.0000",
    "status": "DRAFT"
  }
}
```
*Hệ thống tự động chụp lại thông tin giá bán, áp dụng mức thuế suất VAT (1%) tương ứng cấu hình của sản phẩm tại thời điểm tạo hóa đơn và tạm tính số thuế VAT phải nộp (`taxPayable`).*

#### 2. Phát hành hóa đơn (Xin cấp mã từ Cơ quan Thuế - CQT)
Hóa đơn chỉ chính thức sinh doanh thu tính thuế và trừ kho sau khi được phát hành thành công (chuyển trạng thái từ `DRAFT` sang `ISSUED` và được cấp mã CQT).
* **Endpoint**: `POST /v1/invoices/<invoicePublicId>/publish`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response Example (200 OK)**:
```json
{
  "message": "Publish invoice success.",
  "data": {
    "publicId": "cmo6p5abc0004x8pfaaaaaaaa",
    "status": "ISSUED",
    "cqtCode": "CQT-8c7c10b740521e15",
    "issueDate": "2026-05-20T14:28:30.000Z"
  }
}
```
> [!WARNING]
> **Ràng buộc Tồn kho:**
> Nếu số lượng bán vượt quá tồn kho thực tế (`currentStock`), API Publish sẽ trả về lỗi `400 Bad Request` để chống xuất âm kho.

#### 3. Hủy hóa đơn bán ra (Cancel Invoice)
Cho phép hủy hóa đơn nếu có sai sót (chỉ áp dụng với trạng thái `DRAFT` hoặc `SYNC_FAILED`). Trạng thái sẽ chuyển thành `CANCELED` và hoàn lại số lượng tồn kho đã giữ chỗ.
* **Endpoint**: `PATCH /v1/invoices/<invoicePublicId>/cancel`
* **Headers**: `Authorization: Bearer <accessToken>`

---

### PHÂN LUỒNG B: Hóa Đơn Mua Vào (Inbound Invoice)

Ghi nhận hóa đơn đầu vào từ nhà cung cấp để bổ sung hàng hóa vào kho và tính chi phí hợp lệ (áp dụng cho nhóm thuế tính theo lợi nhuận).

#### 1. Tạo hóa đơn mua vào
* **Endpoint**: `POST /v1/inbound-invoices`
* **Headers**:
  * `Content-Type: application/json`
  * `Authorization: Bearer <accessToken>`
* **Request Body**:
```json
{
  "sellerName": "Công ty phân phối café Trung Nguyên",
  "sellerTaxCode": "0100234567",
  "invoiceNo": "HD-0009823",
  "issueDate": "2026-05-20T00:00:00.000Z",
  "isSyncedToInventory": false,
  "items": [
    {
      "productPublicId": "cmo6p1xyz0003x8pf77777777",
      "quantity": 50,
      "unitCost": 140000
    }
  ]
}
```
* **Response Example (201 Created)**:
```json
{
  "message": "Create success.",
  "data": {
    "publicId": "cmo6p9def0005x8pfbbbbbbbb",
    "sellerName": "Công ty phân phối café Trung Nguyên",
    "totalAmount": "7000000.0000",
    "status": "ACTIVE",
    "isSyncedToInventory": false
  }
}
```

#### 2. Đồng bộ tồn kho đầu vào (Sync to Inventory)
Khi hóa đơn đầu vào đã khớp dữ liệu thực tế nhập kho, thực hiện đồng bộ kho để cộng số lượng sản phẩm vào kho hiện tại (`currentStock`).
* **Endpoint**: `PATCH /v1/inbound-invoices/<inboundInvoicePublicId>/sync-inventory`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response Example (200 OK)**:
```json
{
  "message": "Sync to inventory success.",
  "data": {
    "publicId": "cmo6p9def0005x8pfbbbbbbbb",
    "isSyncedToInventory": true
  }
}
```
*Lượng tồn kho hiện tại (`currentStock`) của Cà phê Arabica sẽ tự động tăng thêm 50 kg.*
