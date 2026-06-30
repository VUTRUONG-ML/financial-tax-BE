# 📋 Báo Cáo Đối Chiếu & Giải Đáp Tích Hợp API - Module Kê Khai Thuế & Chốt Kỳ
**Ngày lập:** 2026-06-29  
**Người thực hiện:** Antigravity (AI Pair Programmer)  
**Phạm vi:** Đối chiếu `docs/plan_api_tax_declaration.md` với `src/tax-declaration` và `docs/TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md`.

---

## 1. Các Điểm Thiếu Sót & Sai Lệch Nghiêm Trọng Trong Plan của Frontend

Qua đối chiếu mã nguồn Backend (`src/tax-declaration`) và tài liệu hướng dẫn tích hợp, chúng tôi phát hiện bản kế hoạch cũ của Frontend (`docs/plan_api_tax_declaration.md`) đang gặp các sai lệch nghiêm trọng sau:

### 1.1. Xác định Session ID vs. Period Public ID (Lỗi thiết kế cốt lõi)
* **Sai lệch của FE:** FE Plan phân tách `:sessionId` (sessionPublicId do `/start` trả về) làm tham số động cho toàn bộ các endpoint Step 1 đến Step 5 và Submit.
* **Thực tế ở Backend:** 
  - Toàn bộ các route Step 1 đến Step 5 và Submit (`GET step-1/:publicId`, `POST step-1/save/:publicId`, etc.) đều dùng **`:publicId` là `publicId` của Kỳ tài chính (Financial Period)**, chứ **không** dùng `sessionPublicId` của phiên làm việc.
  - Endpoint `/tax-declaration/start` chỉ thực hiện `upsert` bản nháp và trả về record draft trong DB.
  - **Quy tắc cho FE:** FE không cần lưu trữ hoặc truyền `sessionPublicId` cho các bước tiếp theo. Hãy sử dụng trực tiếp **`periodPublicId`** (ID công khai của kỳ tài chính) làm tham số động duy nhất cho toàn bộ Wizard.

### 1.2. Thiếu sót endpoint Lịch sử tờ khai (History)
* **Sai lệch của FE:** FE Plan không đưa endpoint `/history` vào vì cho rằng chưa có contract chính thức và dự phòng bằng local cache.
* **Thực tế ở Backend:** 
  - Backend **ĐÃ triển khai chính thức** endpoint này:
    - **Route:** `GET /v1/tax-declaration/history`
    - **Authentication:** Yêu cầu Bearer Token.
    - **Phản hồi:** Trả về mảng các đối tượng ánh xạ theo `TaxDeclarationHistoryItemDto`.
  - **Quy tắc cho FE:** Phải loại bỏ hoàn toàn cơ chế cache local tạm thời. Dùng endpoint này làm nguồn dữ liệu chính xác duy nhất để hiển thị lịch sử tờ khai kế khai của HKD.

### 1.3. Cấu trúc Multipart Form-Data của API Submit
* **Sai lệch của FE:** FE Plan lo ngại payload submit không thống nhất giữa JSON và Multipart, và MVP định bỏ qua việc gửi file PDF.
* **Thực tế ở Backend:** 
  - API nộp tờ khai (`submit`, `submit-force`, `submit-ignore-warning`) bắt buộc sử dụng **`multipart/form-data`**.
  - Các trường dữ liệu trong form-data gồm:
    1. `chosenPitMethod`: Enum (`EXEMPT` | `PERCENTAGE` | `PROFIT_15` | `PROFIT_17` | `PROFIT_20`)
    2. `xmlContent`: Chuỗi XML tờ khai được tạo từ client.
    3. `file` (Tùy chọn): File PDF tờ khai được kết xuất vật lý.
  - **Quy tắc cho FE:** Bắt buộc gửi đúng kiểu Multipart Form-Data với 2 trường `chosenPitMethod` và `xmlContent`. Trường `file` PDF có thể bỏ trống (optional).

### 1.4. Lọc Tùy chọn Tờ khai theo Kỳ
* **Sai lệch của FE:** FE tự ý quyết định danh sách biểu mẫu hiển thị bằng nhóm thuế của profile người dùng local (`userProfile.tax_group`).
* **Thực tế ở Backend:**
  - Danh sách biểu mẫu hợp lệ được quản lý và trả về từ API `/options/:periodPublicId`.
  - **Quy tắc cho FE:** FE phải gọi API options sau khi người dùng chọn kỳ, lấy danh sách các tùy chọn do BE cung cấp để hiển thị lên UI, không tự ý suy luận offline.

---

## 2. Đặc Tả Chi Tiết API Lịch Sử Tờ Khai (History API)

Frontend sử dụng endpoint này để render danh sách lịch sử tại trang chủ của Module Thuế:

* **Route:** `/v1/tax-declaration/history`
* **Method:** `GET`
* **Response Data (JSON):**
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-06-29T16:00:00.000Z",
  "message": "Tax declarations history retrieved successfully.",
  "data": [
    {
      "publicId": "exp-102-public-id", // ID của tờ khai xuất bản chính thức
      "formType": "01_CNKD", // Loại tờ khai (01_CNKD, 01_TKN_CNKD, 02_CNKD_TNCN_QTT)
      "periodName": "Tháng 05/2026", // Tên kỳ tài chính tương ứng
      "taxYear": 2026, // Năm tính thuế
      "declaredRevenue": 250000000, // Doanh thu chốt kê khai
      "totalTaxAmount": 2500000, // Tổng số tiền thuế phải nộp
      "createdAt": "2026-06-29T15:30:00.000Z", // Thời gian ký nộp
      "pdfUrl": "https://storage.googleapis.com/.../01_CNKD.pdf", // Link tải PDF (hoặc null)
      "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>..." // Nội dung XML lưu trữ
    }
  ]
}
```

---

## 3. Bản Đồ API Tích Hợp Đồng Bộ Sau Sửa Đổi (FE ↔ BE)

FE cần sửa lại toàn bộ kịch bản cấu hình API Route và Service theo bản đồ chính xác dưới đây:

```typescript
TAX_DECLARATION: {
  INIT: '/v1/tax-declaration/init',
  OPTIONS: (periodPublicId: string) => `/v1/tax-declaration/options/${periodPublicId}`,
  START: '/v1/tax-declaration/start',
  
  // Toàn bộ các step sử dụng periodPublicId làm định danh
  STEP_1: (periodPublicId: string) => `/v1/tax-declaration/step-1/${periodPublicId}`,
  SAVE_STEP_1: (periodPublicId: string) => `/v1/tax-declaration/step-1/save/${periodPublicId}`,
  STEP_2: (periodPublicId: string) => `/v1/tax-declaration/step-2/${periodPublicId}`,
  SAVE_STEP_2: (periodPublicId: string) => `/v1/tax-declaration/step-2/save/${periodPublicId}`,
  STEP_3: (periodPublicId: string) => `/v1/tax-declaration/step-3/${periodPublicId}`,
  SAVE_STEP_3: (periodPublicId: string) => `/v1/tax-declaration/step-3/save/${periodPublicId}`,
  STEP_4: (periodPublicId: string) => `/v1/tax-declaration/step-4/${periodPublicId}`,
  SAVE_STEP_4: (periodPublicId: string) => `/v1/tax-declaration/step-4/save/${periodPublicId}`,
  PREVIEW: (periodPublicId: string) => `/v1/tax-declaration/step-5/preview/${periodPublicId}`,
  
  // Submit sử dụng periodPublicId, payload gửi dưới dạng FormData
  SUBMIT: (periodPublicId: string) => `/v1/tax-declaration/submit/${periodPublicId}`,
  SUBMIT_FORCE: (periodPublicId: string) => `/v1/tax-declaration/submit-force/${periodPublicId}`,
  SUBMIT_IGNORE_WARNING: (periodPublicId: string) =>
    `/v1/tax-declaration/submit-ignore-warning/${periodPublicId}`,
    
  // Endpoint lịch sử chính thức
  HISTORY: '/v1/tax-declaration/history'
}
```

---

## 4. Kịch Bản Cập Nhật Kế Hoạch Của Frontend (`plan_api_tax_declaration.md`)

Chúng tôi khuyến nghị Frontend tiến hành cập nhật lại bản kế hoạch phát triển theo các bước:
1. **Xóa bỏ các logic session draft cũ ở local**: Không persist `sessionPublicId` vì nó không được dùng làm tham số định tuyến.
2. **Sửa kiểu dữ liệu Query/DTO**: Đồng bộ toàn bộ interfaces gửi Step 1-5 và Submit theo `periodPublicId`.
3. **Cập nhật UI Step 1 và Submit**: Thiết lập form gửi dạng `FormData` với header `multipart/form-data` khi gọi API Submit.
4. **Tích hợp UI History**: Gọi `GET /tax-declaration/history` để hiển thị danh sách lịch sử, loại bỏ localStorage lưu trữ tờ khai cũ.
