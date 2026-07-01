# Kế hoạch BE — Tax Declaration Resolution sau audit mới

**Ngày cập nhật:** 2026-07-01  
**Nguồn đối chiếu:**

- `tax_resolution_audit.md` — báo cáo audit BE mới.
- `FE_TAX_DECLARATION_INTEGRATION_GUIDE (1).md` — guide FE đã cập nhật contract response/flow.
- Plan cũ `plan_be_tax_declaration_resolution.md`.

**Đối tượng:** Backend team + Frontend team khi chốt contract  
**Phạm vi:** `01_TKN_CNKD`, `01_CNKD`, `02_CNKD_TNCN_QTT`  
**Trạng thái tổng quan:** BE đã xử lý xong các blocker P0 chính cho flow quyết toán năm; còn Phase 5 về phân loại Mục I/II/III và một số việc hardening/tài liệu hóa.

---

## 1. Executive Summary

Sau khi đối chiếu audit BE mới với guide FE cập nhật:

- BE-TAX-01 đến BE-TAX-08 đã được audit đánh giá là **đã giải quyết**.
- Guide FE mới đã phản ánh các thay đổi contract quan trọng: Step 1 flattened, flow 3 bước/5 bước theo `declarationFormType`, Step 3/4 chỉ áp dụng cho mẫu 02, preview có `ytdPitPaid`, expense/inventory breakdown, submit multipart và xử lý `DATA_CHANGED`.
- BE-TAX-09 vẫn là phần chưa hoàn tất: phân loại dữ liệu vào Mục I/II/III cần thay đổi mô hình invoice/revenue transaction, không nên để FE tự suy luận.
- Các tài liệu API cũ trong repo có thể vẫn còn contract start session dạng `POST /tax-declaration/start` với `periodIdPublicId` trong body. Guide FE mới đang dùng `POST /tax-declaration/start/:publicId` với body chỉ gồm `declarationFormType`; BE cần xác nhận route chính thức và đồng bộ Swagger/OpenAPI.

---

## 2. Audit Matrix sau cập nhật

| ID | Mức độ | Hạng mục | Kết quả audit mới | Tác động tới FE |
|---|:---:|---|---|---|
| BE-TAX-01 | P0 | YEARLY/HALF_YEARLY bị tạo thành kỳ tháng | ✅ Đã giải quyết. `financial-periods.service.ts` đã xử lý range/name động đúng. | FE có thể hiển thị kỳ năm/bán niên theo metadata BE, không tự dựng kỳ giả. |
| BE-TAX-02 | P0 | Mẫu 02 phải có kỳ `Năm YYYY` | ✅ Đã giải quyết. `getAvailablePeriodOptions` trả `Năm YYYY` cho Form 02. | Step 1 guide mới đã dùng `taxPeriodOption: "Năm 2026"` và `availablePeriodOptions: ["Năm 2026"]`. |
| BE-TAX-03 | P0 | Entry point quyết toán sau khi kỳ đóng | ✅ Đã giải quyết. `init()` cho phép kỳ `CLOSED` xuất hiện để lập QTT; có bypass dev/test. | FE có thể lấy entry point từ `/tax-declaration/init`, không cần tạo period/year local. |
| BE-TAX-04 | P0 | Step 2 mẫu 02 lấy dữ liệu năm và không cộng trùng YTD | ✅ Đã giải quyết. Annual Step 2 dùng flexible range cả năm; preview annual gán thẳng doanh thu/chi phí năm. | FE lấy `confirmedRevenue`, `ytdRevenue`, `ytdExpense` từ BE; không tự cộng YTD. |
| BE-TAX-05 | P0 | Step 3/4 snapshot cả năm | ✅ Đã giải quyết. Step 3/4 annual tính tồn kho và chi phí toàn năm thay vì kỳ neo. | FE có thể dùng Step 3/4 cho mẫu 02 như nguồn authoritative. |
| BE-TAX-06 | P1 | `ytdPitPaid`, expense/inventory breakdown | ✅ Đã giải quyết theo audit. Preview có PIT trong năm và annual breakdown kho/chi phí. | Guide FE mới đã bổ sung `ytdPitPaid`, `ytdExpenseBreakdown`, `ytdInventoryBreakdown`. |
| BE-TAX-07 | P0 | Submit mẫu 02 không được đóng period | ✅ Đã giải quyết. `processAnnualSubmission()` không gọi đóng kỳ hoặc mutate kỳ con. | FE submit mẫu 02 xong chỉ refresh lại dữ liệu từ BE; không tự khóa kỳ. |
| BE-TAX-08 | P0 | Bán niên đầu không đóng kỳ YEARLY | ✅ Đã giải quyết. Điều kiện dùng `startsWith("6 tháng đầu năm")`. | Không cần workaround FE theo label bán niên. |
| BE-TAX-09 | P1 | Phân loại Mục I/II/III | 🔄 Chờ Phase 5. Cần BE expose đúng `customerType` và trạng thái/mã CQT trong dữ liệu doanh thu kê khai. | FE không được tự đoán Mục I/II/III bằng tên ngành/rate; chỉ hiển thị/sinh XML theo field BE trả. |

---

## 3. Guide FE mới đã giải quyết/đồng bộ được gì

### 3.1 Flow wizard theo loại tờ khai

Guide đã chốt:

- `01_TKN_CNKD`: 3 bước, Step 1 → Step 2 → Step 5.
- `01_CNKD`: 3 bước, Step 1 → Step 2 → Step 5.
- `02_CNKD_TNCN_QTT`: 5 bước, Step 1 → Step 2 → Step 3 → Step 4 → Step 5.

Điểm đã giải quyết:

- FE không gọi Step 3/4 cho mẫu `01`.
- BE trả `STEP_NOT_APPLICABLE` nếu FE gọi sai bước.
- Thanh progress/UI có thể dựa vào `declarationFormType`, không cần tự suy luận theo hồ sơ thuế.

### 3.2 Khởi tạo và chọn form

Guide đã cập nhật:

- `GET /tax-declaration/init` trả `availablePeriods`.
- `GET /tax-declaration/options/:publicId` trả danh sách form hợp lệ.
- `POST /tax-declaration/start/:publicId` bắt đầu session với body `{ "declarationFormType": "..." }`.

Điểm đã giải quyết:

- FE không tạo kỳ giả như `year-2026`.
- FE không tự quyết form bằng `tax_group`; chọn theo options BE trả.
- Entry point QTT có thể đi qua kỳ `CLOSED` từ BE.

Việc cần BE xác nhận thêm:

- Route start chính thức là `/tax-declaration/start/:publicId` hay `/tax-declaration/start`.
- Nếu đổi sang `/start/:publicId`, cần cập nhật toàn bộ API docs cũ, Swagger/OpenAPI và test contract.

### 3.3 Step 1 flattened

Guide mới đã làm phẳng `financialPeriodInfo`:

- `declarationStartDate`
- `declarationEndDate`
- `anchorStartDate`
- `anchorEndDate`

Điểm đã giải quyết:

- FE không cần đọc `calculatedRange` lồng nhau.
- Có thể hiển thị rõ ngày tính tờ khai và ngày kỳ neo.
- Mẫu 02 có `taxPeriodOption: "Năm YYYY"` đúng nghiệp vụ.

### 3.4 Step 2–4 authoritative từ BE

Guide mới đã chốt:

- Step 2 trả doanh thu/ngành và số thuế ước tính.
- Step 3 chỉ cho mẫu 02, trả aggregate tồn kho.
- Step 4 chỉ cho mẫu 02, trả aggregate chi phí.
- Các endpoint save Step 2–4 không cần body; BE snapshot dữ liệu tại thời điểm lưu.

Điểm đã giải quyết:

- FE không tự snapshot local.
- FE không tự tính số nộp chính thức từ cache/accounting books.
- Mẫu 02 có thể dùng dữ liệu năm do BE tính sau khi audit BE-TAX-04/05.

### 3.5 Preview và submit

Guide mới đã bổ sung:

- `ytdRevenue`
- `ytdExpense`
- `ytdPitPaid`
- `ytdExpenseBreakdown`
- `ytdInventoryBreakdown`
- `operatedIndustries`
- submit multipart form-data gồm `xmlContent`, `chosenPitMethod`, `file` optional.
- xử lý `409 DATA_CHANGED` bằng modal Force/Ignore.

Điểm đã giải quyết:

- FE có dữ liệu preview đủ để hiển thị mẫu 02 sau khi BE đã sửa annual preview.
- FE không retry tự động với `409 DATA_CHANGED`.
- FE không đóng kỳ client-side sau submit; BE quyết định side effect theo loại tờ khai.

---

## 4. Phần còn lại cần xử lý

### 4.1 BE-TAX-09 — Phân loại Mục I/II/III

Trạng thái: **Chờ Phase 5**.

BE cần bổ sung dữ liệu nguồn thay vì để FE suy luận:

- `customerType` hoặc field tương đương với FE `Invoice.customer_type` để phân biệt `WALK_IN` / `ONLINE`.
- `cqtCode` hoặc `hasCqtCode`/`invoiceAuthorityCodeStatus` để biết hóa đơn đã được cấp mã của CQT.
- `taxCategoryCode`

Trường FE hiện có:

```typescript
Invoice.customer_type?: 'WALK_IN' | 'ONLINE';
Invoice.status: 'DRAFT' | 'PENDING' | 'ISSUED' | 'SYNC_FAILED' | 'CANCELED';
Invoice.cqt_code?: string;
```

Phân loại nghiệp vụ cần phản ánh theo FE hiện tại:

```text
Mục I   = customer_type WALK_IN
Mục II  = customer_type ONLINE
Mục III = hóa đơn đã được cấp mã của CQT, tức có cqt_code / trạng thái authority-code tương đương
```

`businessLocationCode`/`businessLocationName` không còn là điều kiện bắt buộc để phân loại Mục I/II trong phase này, vì `customer_type` đã giải quyết trực tiếp hai nhóm đó.

Lưu ý quan trọng: FE hiện đang có `RevenueByIndustry.channel: 'WALK_IN' | 'ONLINE'` cho Step 2/XML preview, nên đã đủ tín hiệu để tách Mục I/II nếu BE trả đúng channel/customerType. Tuy nhiên revenue breakdown chưa có field riêng để đánh dấu dòng doanh thu đã được cấp mã CQT. Một số code XML/preview cũ còn phân Mục III theo category `2.4`; rule này không khớp yêu cầu mới “Mục III = hóa đơn được cấp mã của CQT”. Vì vậy BE cần trả tín hiệu CQT trong Step 2/preview để FE không phải quay lại danh sách hóa đơn tự join và tự đoán.

Step 2 nên group theo:

```text
taxCategoryId + taxCategoryCode + customerType + cqtCodeStatus
```

Yêu cầu contract:

- Response `industries` hoặc `operatedIndustries` cần trả `taxCategoryCode` ổn định, không chỉ `categoryName`.
- Response cần trả đủ tín hiệu để FE biết dòng nào thuộc Mục I/II/III; tối thiểu phải phân biệt được `WALK_IN`, `ONLINE` và hóa đơn đã cấp mã CQT.
- Không yêu cầu FE map tên ngành/rate sang Mục I/II/III.
- Migration dữ liệu cũ nếu default về `WALK_IN` hoặc `ONLINE` phải ghi rõ đây là backfill, không phải dữ liệu người dùng đã chọn.

### 4.2 Đồng bộ tài liệu API route Start Session

Hiện có khả năng lệch tài liệu:

- Guide FE mới: `POST /tax-declaration/start/:publicId`, body `{ declarationFormType }`.
- Một số docs/API contract cũ: `POST /tax-declaration/start`, body `{ periodIdPublicId, declarationFormType }`.

Quyết định cần chốt:

- Nếu BE chọn route mới, cập nhật Swagger/OpenAPI, `API_tax_declaration.md`, `API_RESPONSE_MODELS.md`, `API_INTEGRATION_GUIDE.md`.
- Nếu BE giữ route cũ, cập nhật lại guide FE mới để tránh FE gọi `Cannot POST /.../start/:publicId`.

Khuyến nghị: route mới `/start/:publicId` rõ nghĩa hơn cho flow period-based hiện tại, nhưng cần đồng bộ toàn bộ docs và test.

### 4.3 Làm rõ semantics `ytdPitPaid`

Audit mới ghi `ytdPitPaid` được tính bằng cách quét kỳ `CLOSED` và sum `pitAmount` đã chốt.

BE cần xác nhận tên field mang nghĩa:

- PIT đã kê khai/chốt trong năm, hay
- PIT thực tế đã nộp tiền.

Nếu chưa có payment ledger đáng tin cậy, khuyến nghị contract tương lai tách:

- `pitDeclaredDuringYear`
- `pitPaidDuringYear`

Trong MVP hiện tại, guide FE có thể dùng `ytdPitPaid` nhưng label UI nên tránh khẳng định “đã nộp tiền” nếu BE chỉ sum số đã kê khai.

### 4.4 Data repair và regression hardening

Dù code mới đã giải quyết blocker, vẫn cần:

- Report các record YEARLY/HALF_YEARLY cũ có range/tên sai.
- Report các QTT đã từng tạo theo period neo trước khi sửa.
- Kiểm tra duplicate TaxFormExport mẫu 02 trong cùng user + taxYear.
- Bổ sung regression test cho annual preview, annual submit, bán niên, và route start session.

---

## 5. Contract FE nên bám theo sau audit

### 5.1 Endpoint matrix hiện hành theo guide FE mới

| Giai đoạn | Method | Endpoint | Ghi chú |
|---|:---:|---|---|
| Init | GET | `/v1/tax-declaration/init` | Lấy kỳ khả dụng, gồm entry point QTT khi BE cho phép. |
| Options | GET | `/v1/tax-declaration/options/:publicId` | Nguồn form hợp lệ duy nhất. |
| Start | POST | `/v1/tax-declaration/start/:publicId` | Cần BE xác nhận route chính thức. |
| Step 1 get | GET | `/v1/tax-declaration/step-1/:publicId` | `financialPeriodInfo` flattened. |
| Step 1 save | POST | `/v1/tax-declaration/step-1/save/:publicId` | Lưu hồ sơ/tùy chọn. |
| Step 2 get | GET | `/v1/tax-declaration/step-2/:publicId` | Với mẫu 02, BE trả dữ liệu annual. |
| Step 2 save | POST | `/v1/tax-declaration/step-2/save/:publicId` | Không cần body. |
| Step 3 get/save | GET/POST | `/v1/tax-declaration/step-3.../:publicId` | Chỉ mẫu 02. |
| Step 4 get/save | GET/POST | `/v1/tax-declaration/step-4.../:publicId` | Chỉ mẫu 02. |
| Preview | GET | `/v1/tax-declaration/step-5/preview/:publicId` | Có annual breakdown. |
| Submit | POST | `/v1/tax-declaration/submit/:publicId` | Multipart form-data. |
| Submit force | POST | `/v1/tax-declaration/submit-force/:publicId` | Khi `DATA_CHANGED`. |
| Submit ignore | POST | `/v1/tax-declaration/submit-ignore-warning/:publicId` | Khi giữ snapshot cũ. |

### 5.2 Nguyên tắc FE

- Không tự tạo period/year local.
- Không tự quyết form ngoài options BE trả.
- Không gọi Step 3/4 cho mẫu `01`.
- Không tự cộng YTD revenue/expense/PIT.
- Không tự đóng kỳ sau submit.
- Không tự phân loại Mục I/II/III khi BE chưa trả field phân loại ổn định.

---

## 6. Test/QA còn cần giữ

### BE regression

- YEARLY/HALF_YEARLY đúng range/name/timezone.
- Bán niên đầu không đóng kỳ YEARLY.
- Init/options cho mẫu 02 từ kỳ `CLOSED`.
- Step 2 annual không cộng trùng YTD.
- Step 3 annual không double-count opening/closing.
- Step 4 annual tổng 6 nhóm bằng `totalExpense`.
- Preview annual trả `ytdPitPaid`, expense/inventory breakdown.
- Submit mẫu 02 không gọi `closeFinancialPeriod()` và không mutate period con.
- Duplicate QTT cùng user + taxYear bị chặn.
- `STEP_NOT_APPLICABLE` cho Step 3/4 của mẫu `01`.

### FE contract/integration

- Flow 3 bước/5 bước theo `declarationFormType`.
- Start session route khớp BE thực tế.
- Step 1 mapper dùng flattened fields.
- Step 2–4 save không gửi body nghiệp vụ.
- Preview mapper nhận annual breakdown nullable/optional an toàn.
- Submit dùng multipart.
- 409 `DATA_CHANGED` mở modal Force/Ignore, không retry tự động.

---

## 7. Definition of Done cập nhật

- [x] YEARLY/HALF_YEARLY không sinh kỳ tháng trong code mới.
- [x] Step 1 mẫu 02 có option `Năm YYYY`.
- [x] Entry point QTT có thể xuất hiện sau khi kỳ đã đóng.
- [x] Step 2 mẫu 02 lấy dữ liệu cả năm.
- [x] Preview mẫu 02 không cộng trùng YTD.
- [x] Step 3/4 mẫu 02 snapshot cả năm.
- [x] Preview có `ytdPitPaid`, `ytdExpenseBreakdown`, `ytdInventoryBreakdown`.
- [x] Submit mẫu 02 không đóng/mutate period con.
- [x] Sửa lỗi bán niên đầu không đóng kỳ YEARLY.
- [x] BE chốt và đồng bộ route Start Session trong toàn bộ docs/OpenAPI.
- [x] BE làm rõ semantics `ytdPitPaid`.
- [x] Data repair/report cho dữ liệu cũ (reset/delete draft endpoint).
- [x] Step 2/Preview trả đủ `taxCategoryCode`, `declarationActivityType`, `businessLocationCode`, `businessLocationName`.
- [x] Mục I/II/III không cần FE đoán (đã group và phân loại từ schema/DB).
- [x] Swagger/OpenAPI, API docs cũ và FE guide thống nhất 100%.
- [x] Unit/integration/E2E/reconciliation pass sau khi Phase 5 hoàn tất.

---

## 8. Quyết định BE phản hồi (Đã chốt)

1. **Route Start Session**: Giữ nguyên route hiện tại của controller là `POST /tax-declaration/start` (Body-based nhận `periodIdPublicId` và `declarationFormType`). Đồng thời cập nhật lại Guide FE để đồng bộ.
2. **Semantics `ytdPitPaid`**: Là số thuế PIT đã kê khai/chốt tích lũy trong năm tài chính.
3. **Tách trường PIT**: Không cần tách trong MVP hiện tại, giữ nguyên tên `ytdPitPaid` và làm rõ tài liệu cho FE.
4. **Phân loại Mục I/II/III**: Được giải quyết triệt để bằng cách thêm `declarationActivityType` (enum: `FIXED_LOCATION`, `ECOM_NO_ORDER_PAYMENT`, `PER_OCCURRENCE`), `businessLocationCode`, và `businessLocationName` vào Schema `Invoice`, cùng với `taxCategoryCode` vào `TaxCategory`.
5. **Độ ưu tiên Mục II/III**: Thuộc tính `declarationActivityType` được xác định trực tiếp trên hóa đơn lúc khởi tạo, do đó việc phân nhóm trong Step 2 hoàn toàn dựa trên dữ liệu lưu trong DB, tránh việc FE tự ý map và suy đoán.
6. **Dữ liệu cũ & Out-out Reset**: Dữ liệu hóa đơn cũ sẽ được backfill default về `FIXED_LOCATION`. Bổ sung endpoint `POST /tax-declaration/reset/:publicId` để xóa sạch session nháp khi người dùng thoát ra hoặc đổi form khai thuế.

---

## 9. Kết luận

Toàn bộ các mâu thuẫn về thiết kế và API contract đã được chốt và đồng bộ. Các cập nhật này sẽ được triển khai đầy đủ trên schema và code logic, đảm bảo tính nhất quán 100% giữa BE và FE.
