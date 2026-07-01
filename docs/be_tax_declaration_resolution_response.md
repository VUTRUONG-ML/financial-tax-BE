# Phản hồi BE cho FE — Tax Declaration & Invoice Classification

**Ngày cập nhật:** 2026-07-01  
**Phạm vi:** luồng tạo hóa đơn bán ra, phân loại doanh thu kê khai thuế, reset draft wizard kê khai thuế.

Tài liệu này chốt lại các điểm BE đã sửa/đồng bộ sau phản hồi của FE. FE có thể dùng file này như contract tích hợp mới cho invoice và tax declaration.

---

## 1. Start Session giữ body-based

BE **giữ nguyên route hiện tại trong controller**, không dùng `start/:publicId`.

```http
POST /tax-declaration/start
```

Request body:

```json
{
  "periodIdPublicId": "period-public-id",
  "declarationFormType": "01_CNKD"
}
```

Giá trị hợp lệ của `declarationFormType`:

```text
01_TKN_CNKD
01_CNKD
02_CNKD_TNCN_QTT
```

FE cần bỏ contract cũ:

```http
POST /tax-declaration/start/:publicId
```

### 1.1. Options trả kèm kỳ tính thuế hiển thị

`GET /tax-declaration/options/:publicId` vẫn là API lấy danh sách form hợp lệ, nhưng BE trả thêm metadata kỳ tính thuế cho từng form để FE hiển thị trước khi start session.

Ví dụ response:

```json
[
  {
    "code": "01_CNKD",
    "name": "Dành cho hộ kinh doanh...",
    "taxPeriodOptions": ["Quý 2/2026"],
    "defaultTaxPeriodOption": "Quý 2/2026",
    "declarationStartDate": "2026-04-01T00:00:00.000Z",
    "declarationEndDate": "2026-06-30T23:59:59.999Z",
    "anchorStartDate": "2026-04-01T00:00:00.000Z",
    "anchorEndDate": "2026-06-30T23:59:59.999Z"
  },
  {
    "code": "02_CNKD_TNCN_QTT",
    "name": "Tờ khai quyết toán thuế TNCN cuối năm...",
    "taxPeriodOptions": ["Năm 2026"],
    "defaultTaxPeriodOption": "Năm 2026",
    "declarationStartDate": "2026-01-01T00:00:00.000Z",
    "declarationEndDate": "2026-12-31T23:59:59.999Z",
    "anchorStartDate": "2026-04-01T00:00:00.000Z",
    "anchorEndDate": "2026-06-30T23:59:59.999Z"
  }
]
```

Quy ước:

- Form `01_CNKD`: kỳ tính thuế là kỳ gốc đang chọn, ví dụ tháng/quý hiện tại.
- Form `01_TKN_CNKD`: dùng logic option năm/bán niên hiện có của BE.
- Form `02_CNKD_TNCN_QTT`: luôn trả `taxPeriodOptions = ["Năm YYYY"]` và range cả năm.
- FE không tự gen `Năm YYYY`; BE là nguồn truth cho cả label và khoảng ngày.

---

## 2. Thay đổi schema Invoice

BE tách rõ hai nhóm thông tin trên hóa đơn:

### 2.1. Thông tin khách hàng

Các field mới:

| Field | Type | Ý nghĩa |
|---|---|---|
| `customerType` | `WALK_IN \| ONLINE` | Loại khách hàng trên UI hóa đơn. |
| `buyerPhone` | `string?` | Số điện thoại khách hàng. |
| `buyerNote` | `string?` | Ghi chú khách hàng/đơn online. |

Các field cũ vẫn giữ để không phá contract hiện tại:

```text
buyerEmail
buyerIdNumber
buyerName
buyerTaxCode
buyerAddress
```

Validation:

- Nếu `customerType = ONLINE`: bắt buộc `buyerName` và `buyerPhone`.
- Nếu `customerType = WALK_IN`: thông tin khách hàng là optional.
- Nếu FE không gửi `customerType`, BE default `WALK_IN`.

### 2.2. Nhãn nghiệp vụ kê khai

Các field mới:

| Field | Type | Ý nghĩa |
|---|---|---|
| `declarationActivityType` | `FIXED_LOCATION \| ECOM_NO_ORDER_PAYMENT \| PER_OCCURRENCE` | Bản chất hoạt động bán hàng gốc. |
| `businessLocationCode` | `string?` | Mã địa điểm kinh doanh nếu có. |
| `businessLocationName` | `string?` | Tên địa điểm kinh doanh nếu có. |

Nếu FE không gửi `declarationActivityType`, BE default `FIXED_LOCATION`.

Ý nghĩa enum:

| Enum | Ý nghĩa | Section mặc định nếu không có mã CQT |
|---|---|---|
| `FIXED_LOCATION` | Bán tại địa điểm cố định/cửa hàng/quầy. | `SECTION_I` |
| `ECOM_NO_ORDER_PAYMENT` | Bán online/thương mại điện tử theo flow online hiện tại. | `SECTION_II` |
| `PER_OCCURRENCE` | Phát sinh từng lần. | `SECTION_III` |

---

## 3. Flow FE khi tạo invoice

### 3.1. Khách lẻ/trực tiếp

FE gửi tối thiểu:

```json
{
  "customerType": "WALK_IN",
  "declarationActivityType": "FIXED_LOCATION",
  "paymentMethod": "CASH",
  "issueDate": "2026-07-01T00:00:00.000Z",
  "details": []
}
```

Thông tin `buyerName`, `buyerPhone`, `buyerNote` có thể bỏ trống.

### 3.2. Khách online

FE cần bắt buộc nhập tên và SĐT:

```json
{
  "customerType": "ONLINE",
  "buyerName": "Nguyễn Văn A",
  "buyerPhone": "0900000000",
  "buyerNote": "Đơn từ kênh online",
  "declarationActivityType": "ECOM_NO_ORDER_PAYMENT",
  "paymentMethod": "BANK_TRANSFER",
  "issueDate": "2026-07-01T00:00:00.000Z",
  "details": []
}
```

Nếu thiếu `buyerName` hoặc `buyerPhone`, BE trả `400 Bad Request`.

---

## 4. Quy tắc mã CQT và Mục I/II/III

`declarationActivityType` là **nhãn gốc của hoạt động bán hàng**, không bị đổi khi hóa đơn được cấp mã CQT.

BE dùng `cqtCode` như rule ưu tiên khi tổng hợp tờ khai:

| Điều kiện | `declarationSection` |
|---|---|
| Có `cqtCode` | `SECTION_III` |
| Không có `cqtCode` + `FIXED_LOCATION` | `SECTION_I` |
| Không có `cqtCode` + `ECOM_NO_ORDER_PAYMENT` | `SECTION_II` |
| Không có `cqtCode` + `PER_OCCURRENCE` | `SECTION_III` |

Ví dụ:

```text
Invoice online:
customerType = ONLINE
declarationActivityType = ECOM_NO_ORDER_PAYMENT

Nếu không cấp mã CQT:
-> declarationSection = SECTION_II

Nếu có cấp mã CQT:
-> declarationSection = SECTION_III
-> declarationActivityType vẫn giữ ECOM_NO_ORDER_PAYMENT
```

Lý do: giữ nguyên activity gốc giúp audit đúng lịch sử nghiệp vụ, còn `declarationSection` là kết quả phân loại tại thời điểm kê khai.

---

## 5. Step 2 và Step 5 Preview trả thêm field phân loại

BE chỉ bật grouping theo Mục I/II/III trong luồng Tax Declaration. Các module khác như accounting books hoặc tính thuế chốt kỳ vẫn dùng grouping cũ theo ngành để tránh breaking behavior.

Ở tầng service, `getRevenueByIndustry()` có option:

```text
includeDeclarationGrouping = false
```

Quy ước:

- `false` (default): group theo ngành thuế như cũ.
- `true`: group thêm theo thông tin kê khai để Step 2/Preview render Mục I/II/III.

Khi `includeDeclarationGrouping = true`, BE group doanh thu theo:

```text
taxCategoryId + declarationActivityType + customerType + hasCqtCode + declarationSection
```

Các item trong `step-2.industries[]` và `step-5.operatedIndustries[]` có thêm:

```json
{
  "taxCategoryId": 10,
  "categoryName": "Phân phối, cung cấp hàng hóa",
  "vatRate": 0.01,
  "pitRate": 0.005,
  "revenue": 250000000,
  "declarationActivityType": "ECOM_NO_ORDER_PAYMENT",
  "customerType": "ONLINE",
  "hasCqtCode": false,
  "declarationSection": "SECTION_II"
}
```

FE cần dùng `declarationSection` để render Mục I/II/III, không tự map từ tên ngành, thuế suất hoặc trạng thái invoice.

Lưu ý:

- Một ngành có thể xuất hiện nhiều dòng nếu khác `declarationSection`.
- Hóa đơn có mã CQT không bị double-count; nó chỉ nằm ở `SECTION_III`.

---

## 6. Semantics của `ytdPitPaid`

BE giữ field `ytdPitPaid`, nhưng thống nhất ý nghĩa:

```text
ytdPitPaid = PIT đã kê khai/chốt trong năm tài chính
```

Không hiểu field này là “tiền thuế đã nộp thực tế vào ngân sách”, vì hiện tại hệ thống chưa có payment ledger riêng.

FE nên label theo hướng:

```text
Thuế TNCN đã kê khai trong năm
```

Tránh label:

```text
Thuế TNCN đã nộp
```

---

## 7. Reset draft khi thoát wizard kê khai

BE thêm endpoint:

```http
POST /tax-declaration/reset/:publicId
```

FE gọi endpoint này khi:

- Người dùng bấm thoát khỏi wizard kê khai.
- Người dùng muốn bỏ draft hiện tại để chọn lại form.
- Cần tránh case đã start tờ `02_CNKD_TNCN_QTT`, lưu `taxPeriodOption = Năm YYYY`, sau đó quay lại tờ `01_CNKD` và bị hiển thị sai kỳ.

Response:

```json
{
  "message": "Tax declaration draft session reset successfully.",
  "data": {
    "publicId": "period-public-id",
    "deletedCount": 1
  }
}
```

Endpoint này chỉ xóa `TaxDeclarationDraft`, không xóa:

- invoice
- financial period
- tax declaration đã nộp
- tax form export
- dữ liệu kế toán/kho

---

## 8. Backfill dữ liệu cũ

Các invoice cũ được default:

```text
customerType = WALK_IN
declarationActivityType = FIXED_LOCATION
```

Đây là default kỹ thuật để tương thích dữ liệu cũ, không phải lựa chọn lịch sử của người dùng.

---

## 9. Checklist FE cần cập nhật

- Dùng `POST /tax-declaration/start` với body `periodIdPublicId`.
- Thêm UI chọn `customerType`: khách lẻ hoặc khách online.
- Với khách online, bắt buộc nhập `buyerName` và `buyerPhone`.
- Gửi `declarationActivityType` khi tạo/cập nhật invoice.
- Không đổi `declarationActivityType` khi invoice có mã CQT.
- Render Mục I/II/III theo `declarationSection` BE trả.
- Gọi `POST /tax-declaration/reset/:publicId` khi thoát wizard kê khai.
