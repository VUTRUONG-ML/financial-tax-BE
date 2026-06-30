# 🎨 Hướng Dẫn Tích Hợp Kê Khai Thuế Cho Frontend (FE Tax Declaration Integration Guide)

Tài liệu này hướng dẫn chi tiết cho các lập trình viên Frontend (FE) cách tích hợp giao diện Wizard Kê khai thuế với hệ thống Backend (BE). Tất cả các mô hình dữ liệu (Response Models) dưới đây đã được cập nhật chính xác theo những sửa đổi nghiệp vụ mới nhất.

---

## 1. Bản Đồ Tổng Quan Của Wizard Kê Khai Thuế

Số lượng bước khả dụng và thứ tự hiển thị của Wizard được quyết định hoàn toàn bởi loại tờ khai (`declarationFormType`) được chọn ở bước khởi tạo:

| Loại Tờ Khai | Số Bước | Các Bước Cần Thực Hiện |
| :--- | :---: | :--- |
| **`01_TKN_CNKD`** (Tờ khai năm khoán) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4 trên UI) |
| **`01_CNKD`** (Tờ khai định kỳ tháng/quý) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4 trên UI) |
| **`02_CNKD_TNCN_QTT`** (Quyết toán thuế TNCN năm) | **5 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 3 $\rightarrow$ Step 4 $\rightarrow$ Step 5 |

> [!WARNING]
> Nếu người dùng đang làm tờ khai `01_TKN_CNKD` hoặc `01_CNKD` mà FE gửi API của Step 3 hoặc Step 4, Backend sẽ chặn lại và trả về mã lỗi `400 Bad Request` với `errorCode: "STEP_NOT_APPLICABLE"`. FE cần ẩn hoàn toàn 2 bước này trên thanh tiến trình UI (Progress Bar) của luồng 3 bước.

---

## 2. Quy Trình Khởi Tạo & Các API Response Models Chi Tiết

### 🛠️ API Khởi Tạo Lập Tờ Khai (Init)
* **Endpoint**: `GET /tax-declaration/init`
* **Response Model (`200 OK`)**:
```json
{
  "message": "Tax declaration init success.",
  "data": {
    "isFirstTime": false,
    "availablePeriods": [
      {
        "id": 12,
        "publicId": "period-abc-123",
        "periodName": "Quý 2/2026",
        "startDate": "2026-04-01T00:00:00.000Z",
        "endDate": "2026-06-30T23:59:59.000Z",
        "status": "OPEN"
      },
      {
        "id": 10,
        "publicId": "period-xyz-456",
        "periodName": "Quý 1/2026",
        "startDate": "2026-01-01T00:00:00.000Z",
        "endDate": "2026-03-31T23:59:59.000Z",
        "status": "CLOSED"
      }
    ]
  }
}
```

### 📋 API Lấy Danh Sách Tờ Khai Khả Dụng Theo Kỳ
* **Endpoint**: `GET /tax-declaration/options/:publicId`
* **Response Model (`200 OK`)**:
```json
[
  {
    "code": "01_CNKD",
    "name": "Tờ khai thuế đối với hộ kinh doanh, cá nhân kinh doanh (Mẫu 01/CNKD)",
    "description": "Dành cho hộ kê khai nộp thuế theo định kỳ (tháng/quý)."
  },
  {
    "code": "02_CNKD_TNCN_QTT",
    "name": "Tờ khai quyết toán thuế TNCN (Mẫu 02/CNKD-TNCN-QTT)",
    "description": "Dành cho cá nhân kinh doanh quyết toán thuế TNCN cuối năm."
  }
]
```

### 🚀 API Bắt Đầu Phiên Làm Việc (Start Session)
* **Endpoint**: `POST /tax-declaration/start/:publicId`
* **Request Body**:
```json
{
  "declarationFormType": "02_CNKD_TNCN_QTT"
}
```
* **Response Model (`201 Created`)**:
```json
{
  "message": "Start declaration session success.",
  "data": {
    "financialPeriodId": 12,
    "currentStep": 1,
    "declarationFormType": "02_CNKD_TNCN_QTT"
  }
}
```

---

## 3. Các Bước Trong Wizard Kê Khai Thuế

### 📌 Bước 1: Khai Báo Thông Tin Hành Chính & Tùy Chọn Kỳ
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-1/:publicId`
* **Response Model (`200 OK`)**:
  > [!NOTE]
  > Trường `financialPeriodInfo` đã được **phẳng hóa (flatten)** hoàn toàn, không lồng `calculatedRange` để tránh gây nhầm lẫn về ngày tính toán so với ngày kỳ neo.
```json
{
  "financialPeriodInfo": {
    "periodName": "Quý 2/2026",
    "vatFilingPeriod": "QUARTERLY",
    "declarationStartDate": "2026-04-01T00:00:00.000Z",
    "declarationEndDate": "2026-06-30T23:59:59.000Z",
    "anchorStartDate": "2026-04-01T00:00:00.000Z",
    "anchorEndDate": "2026-06-30T23:59:59.000Z"
  },
  "taxpayerProfile": {
    "taxCode": "0102030405",
    "businessName": "Hộ kinh doanh Nguyễn Văn A",
    "ownerName": "Nguyễn Văn A",
    "phone": "0987654321",
    "cccdNumber": "001095001234",
    "address": "Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội",
    "provinceCity": "Hà Nội",
    "industry": "Bán buôn, bán lẻ quần áo"
  },
  "declarationOptions": {
    "declarationFormType": "02_CNKD_TNCN_QTT",
    "taxpayerOption": "Cá nhân kinh doanh có doanh thu nộp thuế theo phương pháp kê khai",
    "taxPeriodOption": "Năm 2026",
    "declarationTypeOption": "Tờ khai lần đầu",
    "availablePeriodOptions": ["Năm 2026"]
  },
  "authorizedAgentInfo": {
    "authorizedFilerName": "",
    "authorizedFilerTaxCode": "",
    "authorizedFilerDocNumber": "",
    "authorizedFilerDocDate": null,
    "taxAgentName": "",
    "taxAgentTaxCode": ""
  }
}
```

* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-1/save/:publicId`
* **Request Body**:
```json
{
  "taxCode": "0102030405",
  "businessName": "Hộ kinh doanh Nguyễn Văn A",
  "ownerName": "Nguyễn Văn A",
  "cccdNumber": "001095001234",
  "provinceCity": "Hà Nội",
  "taxpayerOption": "Cá nhân kinh doanh có doanh thu nộp thuế theo phương pháp kê khai",
  "taxPeriodOption": "Năm 2026",
  "declarationTypeOption": "Tờ khai lần đầu",
  "authorizedFilerName": "",
  "authorizedFilerTaxCode": "",
  "authorizedFilerDocNumber": "",
  "authorizedFilerDocDate": null,
  "taxAgentName": "",
  "taxAgentTaxCode": ""
}
```

---

### 📌 Bước 2: Xác Nhận Doanh Thu Chịu Thuế
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-2/:publicId`
* **Response Model (`200 OK`)**:
```json
{
  "periodName": "Quý 2/2026",
  "industries": [
    {
      "categoryName": "Phân phối, cung cấp hàng hóa",
      "vatRate": 0.01,
      "pitRate": 0.005,
      "revenue": 250000000
    },
    {
      "categoryName": "Dịch vụ, xây dựng không bao thầu nguyên vật liệu",
      "vatRate": 0.05,
      "pitRate": 0.02,
      "revenue": 50000000
    }
  ],
  "estimatedVat": 5000000,
  "transactionCount": 142,
  "confirmedRevenue": 300000000
}
```

* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-2/save/:publicId`
  * **Lưu ý**: API này **không yêu cầu Request Body**. Backend tự động ghi nhận dữ liệu hóa đơn tại thời điểm lưu.

---

### 📌 Bước 3: Xác Nhận Tồn Kho (Chỉ biểu mẫu `02_CNKD_TNCN_QTT`)

> [!IMPORTANT]
> **Ràng buộc loại tờ khai**: Endpoint này chỉ khả dụng khi loại tờ khai đã lưu ở Step 1 là quyết toán năm `02_CNKD_TNCN_QTT`.
> Nếu truy cập với tờ khai định kỳ `01_CNKD` hoặc `01_TKN_CNKD`, Backend sẽ chặn lại và trả về lỗi `400 Bad Request` với mã lỗi `STEP_NOT_APPLICABLE`. Frontend cần ẩn hoàn toàn bước này trên UI và không thực hiện call API.

* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-3/:publicId`
* **Response Model (`200 OK`)**:
```json
{
  "openingValue": 45000000,
  "importedValue": 120000000,
  "exportedValue": 105000000,
  "closingValue": 60000000
}
```

* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-3/save/:publicId`
  * **Lưu ý**: Không cần Request Body. Backend tự động snapshot trạng thái kho.

---

### 📌 Bước 4: Xác Nhận Chi Phí Hợp Lệ (Chỉ biểu mẫu `02_CNKD_TNCN_QTT`)

> [!IMPORTANT]
> **Ràng buộc loại tờ khai**: Endpoint này chỉ khả dụng khi loại tờ khai đã lưu ở Step 1 là quyết toán năm `02_CNKD_TNCN_QTT`.
> Nếu truy cập với tờ khai định kỳ `01_CNKD` hoặc `01_TKN_CNKD`, Backend sẽ chặn lại và trả về lỗi `400 Bad Request` với mã lỗi `STEP_NOT_APPLICABLE`. Frontend cần ẩn hoàn toàn bước này trên UI và không thực hiện call API.

* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-4/:publicId`
* **Response Model (`200 OK`)**:
```json
{
  "totalExpense": 165000000,
  "chiPhiNguyenVatLieu": 105000000,
  "chiPhiNhanCong": 35000000,
  "chiPhiKhauHao": 10000000,
  "chiPhiDichVuMuaNgoai": 8000000,
  "chiPhiLaiVay": 2000000,
  "chiPhiKhac": 500000
}
```

* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-4/save/:publicId`
  * **Lưu ý**: API này **không yêu cầu Request Body**. Backend tự động snapshot các chứng từ chi phí và giá vốn.

---

### 📌 Bước 5: Xem Trước & Ký Nộp

#### API Xem Trước (Preview)
* **Endpoint**: `GET /tax-declaration/step-5/preview/:publicId`
* **Response Model (`200 OK`)**:
```json
{
  "period": {
    "id": 12,
    "periodName": "Quý 2/2026"
  },
  "step1Data": { /* Thông tin đã lưu ở Step 1 */ },
  "step2Data": { /* Thông tin đã lưu ở Step 2 */ },
  "step3Data": { /* Thông tin đã lưu ở Step 3 (Hoặc null nếu tờ 01) */ },
  "step4Data": { /* Thông tin đã lưu ở Step 4 (Hoặc null nếu tờ 01) */ },
  "pitComparison": {
    "profitMethodAmount": 2800000,
    "percentageMethodAmount": 1500000
  },
  "vatAmount": 5000000,
  "ytdRevenue": 750000000,
  "ytdExpense": 320000000,
  "ytdPitPaid": 3000000,
  "ytdExpenseBreakdown": {
    "totalExpense": 320000000,
    "chiPhiNguyenVatLieu": 210000000,
    "chiPhiNhanCong": 70000000,
    "chiPhiKhauHao": 20000000,
    "chiPhiDichVuMuaNgoai": 15000000,
    "chiPhiLaiVay": 4000000,
    "chiPhiKhac": 1000000
  },
  "ytdInventoryBreakdown": {
    "openingValue": 45000000,
    "importedValue": 225000000,
    "exportedValue": 210000000,
    "closingValue": 60000000
  },
  "operatedIndustries": [
    {
      "categoryName": "Phân phối, cung cấp hàng hóa",
      "revenue": 250000000,
      "ytdRevenue": 600000000,
      "pitRate": 0.005,
      "ytdExemption": 100000000,
      "ytdTaxableRevenue": 500000000
    }
  ]
}
```

#### API Ký Nộp Chính Thức (Kèm xử lý biến động số liệu)
* **Ký nộp thông thường**: `POST /tax-declaration/submit/:publicId`
* **Ký nộp đè (Đồng bộ số mới)**: `POST /tax-declaration/submit-force/:publicId`
* **Ký nộp bỏ qua cảnh báo (Giữ số cũ)**: `POST /tax-declaration/submit-ignore-warning/:publicId`

* **Request Payload (Multipart Form-Data)**:
  * `xmlContent` (String): Chuỗi XML tờ khai đã biên dựng ở Client.
  * `chosenPitMethod` (String): Phương pháp thuế TNCN (`PERCENTAGE` | `PROFIT_15` | `PROFIT_17` | `PROFIT_20`).
  * `file` (File Binary - Optional): File PDF của tờ khai.

---

## 4. Xử Lý Các Trạng Thái Lỗi Từ Backend

1. **Lệch Số Liệu DB so với Bản nháp (409 Conflict - DATA_CHANGED)**:
   Khi FE gọi nộp thông thường mà dữ liệu hóa đơn/kho thực tế thay đổi, BE trả về lỗi `409`:
```json
{
  "statusCode": 409,
  "message": "Dữ liệu hóa đơn hoặc tồn kho đã thay đổi so với bản nháp.",
  "errorCode": "DATA_CHANGED",
  "draftData": { "revenue": 300000000, "expense": 165000000 },
  "realTimeData": { "revenue": 305000000, "expense": 165000000 }
}
```
   * **FE xử lý**: Hiển thị bảng so sánh chênh lệch và popup lựa chọn:
     * Nút **Cập nhật & Nộp**: Gọi API `/submit-force`.
     * Nút **Giữ số cũ & Nộp**: Gọi API `/submit-ignore-warning`.

2. **Truy cập sai bước (400 Bad Request - STEP_NOT_APPLICABLE)**:
   Báo lỗi khi gửi Step 3/4 ở tờ khai định kỳ mẫu `01`. FE điều hướng trực tiếp sang Step 5.
