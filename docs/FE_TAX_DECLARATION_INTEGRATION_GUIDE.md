# 🎨 Hướng Dẫn Tích Hợp Kê Khai Thuế & Báo Cáo Đối Chiếu Nghiệp Vụ (Unified Tax Integration & Audit Guide)

Tài liệu này tổng hợp hướng dẫn tích hợp Frontend (FE) và Báo cáo đối chiếu nghiệp vụ Backend (BE) sau đợt tái cấu trúc hệ thống Kê khai thuế & Quyết toán thuế thu nhập cá nhân năm.

---

## I. Báo Cáo Đối Chiếu & Đánh Giá Nghiệp Vụ (Tax Resolution Audit)

Dưới đây là bảng theo dõi trạng thái khắc phục các lỗi nghiệp vụ và nâng cấp kiến trúc của Backend theo tài liệu đặc tả [plan_be_tax_declaration_resolution.md](file:///E:/financial-tax-system_BE/docs-coding-guidelines/plan_be_tax_declaration_resolution.md):

| ID | Mức độ | Hạng mục lỗi | Giải pháp kỹ thuật trên Backend | Trạng thái |
|---|:---:|---|---|:---:|
| **BE-TAX-01** | P0 | YEARLY/HALF_YEARLY bị tạo thành kỳ tháng | Đã đồng bộ cách tính toán phạm vi ngày co giãn động và cấu trúc tên trong `financial-periods.service.ts`. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-02** | P0 | Mẫu 02 phải có kỳ Năm YYYY | Trả về duy nhất tùy chọn `'Năm YYYY'` cho Form 02. Phẳng hóa `financialPeriodInfo` để tách biệt ngày tính toán và ngày kỳ neo. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-03** | P0 | Entry point quyết toán sau khi kỳ đóng | Mở rộng hàm `init()` để hiển thị kỳ đã `CLOSED`. Tích hợp cờ `process.env.NODE_ENV` bypass để phục vụ Dev/Test lập QTT mọi lúc. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-04** | P0 | Step 2 mẫu 02 lấy dữ liệu năm | Step 2 lấy doanh thu thực tế cả năm. Triệt tiêu hoàn toàn lỗi cộng trùng YTD trong Step 5 Preview bằng cách gán thẳng doanh thu/chi phí thực tế cả năm cho Form 02. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-05** | P0 | Step 3/4 snapshot cả năm | Các hàm Step 3 & Step 4 sử dụng khoảng ngày cả năm tài chính co giãn động (`declarationStartDate` đến `declarationEndDate`) thay vì kỳ neo. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-06** | P1 | `ytdPitPaid`, expense/inventory breakdown | `ytdPitPaid` được tính bằng cách sum trường `pitAmount` của tất cả các kỳ đã `CLOSED` trong năm tài chính. Bổ sung đầy đủ breakdown kho và chi phí năm ở Preview. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-07** | P0 | Submit mẫu 02 không được đóng period | Tạo phương thức `processAnnualSubmission()` chạy trong transaction riêng, lưu tờ khai mà **không gọi đóng kỳ hoặc thay đổi trạng thái kỳ tài chính con**. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-08** | P0 | Bán niên đầu không đóng kỳ YEARLY | Sửa điều kiện so sánh chuỗi thành `chosenPeriodOption?.startsWith('6 tháng đầu năm')`, hỗ trợ tùy chọn bán niên đầu có năm đi kèm. | **✅ ĐÃ XỬ LÝ** |
| **BE-TAX-09** | P1 | Phân loại Mục I/II/III | Đây thuộc về Phase 5 (tương lai), yêu cầu thay đổi bảng Invoice để lưu địa điểm và hình thức kinh doanh. Hiện đã được làm rõ cơ chế chặn để FE không tự ý suy đoán số liệu. | **🔄 CHỜ PHASE 5** |

---

## II. Bản Đồ Tổng Quan Của Wizard Kê Khai Thuế

Số lượng bước khả dụng và thứ tự hiển thị của Wizard được quyết định hoàn toàn bởi loại tờ khai (`declarationFormType`) được chọn ở bước khởi tạo:

| Loại Tờ Khai | Số Bước | Các Bước Cần Thực Hiện |
| :--- | :---: | :--- |
| **`01_TKN_CNKD`** (Tờ khai năm khoán) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4 trên UI) |
| **`01_CNKD`** (Tờ khai định kỳ tháng/quý) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4 trên UI) |
| **`02_CNKD_TNCN_QTT`** (Quyết toán thuế TNCN năm) | **5 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 3 $\rightarrow$ Step 4 $\rightarrow$ Step 5 |

> [!WARNING]
> Nếu người dùng đang làm tờ khai `01_TKN_CNKD` hoặc `01_CNKD` mà FE gửi API của Step 3 hoặc Step 4, Backend sẽ chặn lại và trả về mã lỗi `400 Bad Request` với `errorCode: "STEP_NOT_APPLICABLE"`. FE cần ẩn hoàn toàn 2 bước này trên thanh tiến trình UI (Progress Bar) của luồng 3 bước.

---

## III. Quy Trình Khởi Tạo & Các API Response Models Chi Tiết

### 🛠️ 1. API Khởi Tạo Lập Tờ Khai (Init)
* **Endpoint**: `GET /tax-declaration/init`
* **Mô tả**: Trả về danh sách kỳ tài chính khả dụng cho việc lập tờ khai.
  * Kỳ `OPEN`: Khả dụng cho các tờ khai định kỳ mẫu `01`.
  * Kỳ `CLOSED`: Chỉ khả dụng cho tờ quyết toán mẫu `02` (với điều kiện tất cả các kỳ khác trong năm cũng đã chốt).
  * *Lưu ý*: Trong môi trường `development` hoặc `test`, hệ thống sẽ bypass kiểm tra kỳ `CLOSED` để nhà phát triển có thể tạo tờ khai quyết toán thuế bất kỳ lúc nào phục vụ việc test.
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

### 📋 2. API Lấy Danh Sách Tờ Khai Khả Dụng Theo Kỳ
* **Endpoint**: `GET /tax-declaration/options/:publicId`
* **Mô tả**: Trả về các mẫu tờ khai hợp lệ tương ứng với trạng thái kỳ.
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

### 🚀 3. API Bắt Đầu Phiên Làm Việc (Start Session)
* **Endpoint**: `POST /tax-declaration/start/:publicId`
* **Mô tả**: Khởi tạo phiên làm việc mới cho tờ khai đã chọn.
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

## IV. Chi Tiết Các Bước Trong Wizard Kê Khai Thuế

### 📌 Bước 1: Khai Báo Thông Tin Hành Chính & Tùy Chọn Kỳ
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-1/:publicId`
* **Mô tả**: Lấy thông tin hành chính của hộ kinh doanh và các tùy chọn kỳ.
  * Trường `financialPeriodInfo` được **phẳng hóa (flatten)** hoàn toàn để tránh nhầm lẫn ngày tính toán với ngày kỳ neo.
* **Response Model (`200 OK`)**:
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
* **Mô tả**: Hiển thị danh sách ngành nghề và doanh thu tương ứng trong kỳ kế khai.
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
  * **Lưu ý**: API này **không yêu cầu Request Body**. Backend tự động lấy dữ liệu hóa đơn tại thời điểm lưu để làm snapshot.

---

### 📌 Bước 3: Xác Nhận Tồn Kho (Chỉ biểu mẫu `02_CNKD_TNCN_QTT`)
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-3/:publicId`
* **Mô tả**: Trả về bảng số liệu tồn kho tổng hợp của toàn năm.
  > [!IMPORTANT]
  > **Ràng buộc loại tờ khai**: Endpoint này chỉ khả dụng khi loại tờ khai đã lưu ở Step 1 là quyết toán năm `02_CNKD_TNCN_QTT`. Nếu truy cập với tờ định kỳ `01`, Backend trả về lỗi `400 Bad Request` với mã lỗi `STEP_NOT_APPLICABLE`. Frontend cần ẩn bước này trên UI và không thực hiện call API.
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
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-4/:publicId`
* **Mô tả**: Trả về chi tiết các nhóm chi phí theo Thông tư của toàn năm.
  > [!IMPORTANT]
  > **Ràng buộc loại tờ khai**: Endpoint này chỉ khả dụng khi loại tờ khai đã lưu ở Step 1 là quyết toán năm `02_CNKD_TNCN_QTT`. Nếu truy cập với tờ định kỳ `01`, Backend trả về lỗi `400 Bad Request` với mã lỗi `STEP_NOT_APPLICABLE`. Frontend cần ẩn bước này trên UI và không thực hiện call API.
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
  * **Lưu ý**: Không cần Request Body. Backend tự động snapshot chi phí.

---

### 📌 Bước 5: Xem Trước & Ký Nộp

#### 1. API Xem Trước (Preview)
* **Endpoint**: `GET /tax-declaration/step-5/preview/:publicId`
* **Mô tả**: Tổng hợp dữ liệu thuế, doanh thu, chi phí của toàn chu kỳ để người dùng xem trước.
* **Response Model (`200 OK`)**:
```json
{
  "period": {
    "id": 12,
    "periodName": "Quý 2/2026"
  },
  "step1Data": { /* Dữ liệu Step 1 */ },
  "step2Data": { /* Dữ liệu Step 2 */ },
  "step3Data": { /* Dữ liệu Step 3 (Hoặc null nếu tờ 01) */ },
  "step4Data": { /* Dữ liệu Step 4 (Hoặc null nếu tờ 01) */ },
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

#### 2. Các API Ký Nộp Chính Thức (Yêu cầu `multipart/form-data`)
* **Ký nộp thông thường**: `POST /tax-declaration/submit/:publicId`
* **Ký nộp đè (Đồng bộ số mới)**: `POST /tax-declaration/submit-force/:publicId`
* **Ký nộp giữ nguyên số cũ**: `POST /tax-declaration/submit-ignore-warning/:publicId`

* **Request Payload (Multipart Form-Data)**:
  * `xmlContent` (String): Chuỗi XML tờ khai đã biên dựng ở Client.
  * `chosenPitMethod` (String): Phương pháp thuế TNCN (`PERCENTAGE` | `PROFIT_15` | `PROFIT_17` | `PROFIT_20`).
  * `file` (File Binary - Optional): File PDF của tờ khai để lưu trữ.

---

## V. Xử Lý Các Trạng Thái Lỗi Từ Backend

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
