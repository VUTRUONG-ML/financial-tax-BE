# 📋 Kế hoạch tích hợp API — Module D2/D3: Kê khai thuế & Chốt kỳ

**Ngày lập:** 2026-06-29  
**Trạng thái:** ⏳ Chờ xác nhận API contract & duyệt plan  
**Module:** D2/D3 — Tax Declaration Wizard (3 bước / 5 bước, snapshot, preview, ký nộp)  
**Phạm vi:** Tích hợp 15 endpoint trong `API_tax_declaration.md`; đồng bộ trạng thái kỳ tài chính sau khi nộp; không triển khai nghiệp vụ sản xuất/`RAW_MATERIAL` mới.  
**Tài liệu tham chiếu:**

- [API-intergration-rules.md](../API-intergration-rules.md) — Supreme Rule, quy trình Explore → Plan → Execute và ngoại lệ không Optimistic UI cho D3.
- [API_tax_declaration.md](../Docs/API_tax_declaration.md) — Contract 15 endpoint Tax Declaration.
- [TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md](../Docs/TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md) — Luồng nghiệp vụ, snapshot, khóa kỳ và xử lý `DATA_CHANGED`.
- [plan_api_inventory.md](./plan_api_inventory.md) — Mẫu cấu trúc và mức chi tiết của plan.

---

## 1. Kết quả Explore

### 1.1 Endpoints BE chính thức trong phạm vi

Tất cả endpoint yêu cầu `Authorization: Bearer <token>`. Theo convention hiện tại của `API_ROUTES`, FE sẽ dùng prefix `/v1`; phần path bên dưới giữ nguyên đúng tài liệu BE.

|   # | Giai đoạn        | Method | Endpoint                                                     | FE sử dụng                                                  |
| --: | ---------------- | :----: | ------------------------------------------------------------ | ----------------------------------------------------------- |
|   1 | Khởi tạo         | `GET`  | `/v1/tax-declaration/init`                                   | Tải danh sách kỳ có thể kê khai và trạng thái lần đầu       |
|   2 | Chọn biểu mẫu    | `GET`  | `/v1/tax-declaration/options/:periodPublicId`                | Lấy đúng loại tờ khai BE cho phép ở kỳ đã chọn              |
|   3 | Bắt đầu phiên    | `POST` | `/v1/tax-declaration/start`                                  | Tạo draft/session trên BE                                   |
|   4 | Bước 1 — Lấy     | `GET`  | `/v1/tax-declaration/step-1/:sessionPublicId`                | Auto-fill thông tin HKD và lựa chọn mặc định                |
|   5 | Bước 1 — Lưu     | `POST` | `/v1/tax-declaration/step-1/save/:sessionPublicId`           | Lưu snapshot hồ sơ kê khai                                  |
|   6 | Bước 2 — Lấy     | `GET`  | `/v1/tax-declaration/step-2/:sessionPublicId`                | Tải doanh thu và ngành nghề trong kỳ                        |
|   7 | Bước 2 — Lưu     | `POST` | `/v1/tax-declaration/step-2/save/:sessionPublicId`           | BE tự snapshot doanh thu, không gửi body                    |
|   8 | Bước 3 — Lấy     | `GET`  | `/v1/tax-declaration/step-3/:sessionPublicId`                | Tải tổng hợp tồn kho cho luồng 5 bước                       |
|   9 | Bước 3 — Lưu     | `POST` | `/v1/tax-declaration/step-3/save/:sessionPublicId`           | BE tự snapshot tồn kho, không gửi body                      |
|  10 | Bước 4 — Lấy     | `GET`  | `/v1/tax-declaration/step-4/:sessionPublicId`                | Tải tổng hợp chi phí cho luồng 5 bước                       |
|  11 | Bước 4 — Lưu     | `POST` | `/v1/tax-declaration/step-4/save/:sessionPublicId`           | BE tự snapshot chi phí, không gửi body                      |
|  12 | Bước 5 — Preview | `GET`  | `/v1/tax-declaration/step-5/preview/:sessionPublicId`        | Lấy số liệu chính thức để xem trước và chọn phương pháp PIT |
|  13 | Nộp chuẩn        | `POST` | `/v1/tax-declaration/submit/:sessionPublicId`                | Kiểm tra biến động, nộp và khóa kỳ                          |
|  14 | Nộp số mới       | `POST` | `/v1/tax-declaration/submit-force/:sessionPublicId`          | Chụp lại realtime data rồi nộp                              |
|  15 | Nộp số cũ        | `POST` | `/v1/tax-declaration/submit-ignore-warning/:sessionPublicId` | Giữ snapshot cũ, nộp và ghi audit log                       |

> [!IMPORTANT]
> `:publicId` có hai ngữ nghĩa khác nhau: endpoint `options` dùng **publicId của kỳ**, còn các endpoint step/submit phải dùng **id phiên kê khai do `/start` trả về**. Trong code sẽ đặt tên rõ `periodPublicId` và `sessionPublicId`, tuyệt đối không dùng chung biến `publicId` mơ hồ.

### 1.2 Luồng FE hiện tại

FE đã có UI Tax Wizard tương đối đầy đủ nhưng dữ liệu kê khai vẫn chủ yếu chạy offline:

- `src/pages/tax/wizard/TaxWizardPage.tsx`
  - Vừa hiển thị lịch sử tờ khai, vừa điều phối wizard.
  - Tự quyết định loại tờ khai bằng `userProfile.tax_group`.
  - Tự tạo kỳ giả `year-2026` và `tkn-<year>-<option>` cho biểu mẫu năm.
  - Đọc lịch sử tờ khai từ localStorage qua `taxWizardService.getDeclarations()`.
- `src/services/tax-wizard.service.ts`
  - Lấy doanh thu/tồn kho/chi phí từ accounting books/local cache.
  - Tự tính YTD, PIT, VAT và A/B testing ở client.
  - Upsert tờ khai vào `ftax_tax_declarations`, rồi tự khóa kỳ local bằng `markPeriodClosedFromDeclaration()`.
- `src/store/taxWizardStore.ts`
  - Zustand persist `currentStep`, metadata kỳ và `profile` vào `ftax_tax_wizard_draft`.
  - `revenue`, `inventory`, `expense`, `tax_result` không persist để tránh stale data.
  - Chưa có `sessionPublicId`, options từ BE, trạng thái snapshot, preview server hay submit conflict.
- Các step UI:
  - `Step1_Profile.tsx` cho phép chỉnh profile và nhiều lựa chọn biểu mẫu.
  - `Step2_Revenue.tsx`, `Step3_Inventory.tsx`, `Step4_Expense.tsx` gọi dữ liệu local khi mount; nút Next chỉ đổi step, chưa gọi API snapshot.
  - `Step5_AI_Optimizer.tsx` tự tính thuế, sinh XML, ghi localStorage và khóa kỳ local.
- `src/services/financial-period.service.ts`
  - `GET list/detail`, `PATCH reopen/confirm-payment` đã gọi BE qua `apiCall`.
  - Vẫn có cache/offline fallback và hàm `markPeriodClosedFromDeclaration()` khóa kỳ local.

### 1.3 FE Domain Type là SSOT

Theo Supreme Rule, giữ nguyên domain `snake_case` hiện tại trong `src/types/tax-wizard.ts` và dùng DTO/mapper làm biên chuyển đổi:

| FE domain              | Vai trò                      | Quyết định                                                                                                                          |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TaxDeclarationForm`   | Object trung tâm của wizard  | Giữ cấu trúc `period_id`, `profile`, `revenue`, `inventory`, `expense`, `tax_result`; chỉ bổ sung metadata phiên/snapshot cần thiết |
| `WizardProfileData`    | Dữ liệu UI Bước 1            | Giữ field FE hiện có; mapper merge dữ liệu BE, không xóa field UI-only                                                              |
| `WizardRevenueData`    | Dữ liệu Bước 2               | Giữ `total_revenue`, `by_industry`, `rows`; totals từ BE là authoritative                                                           |
| `WizardInventoryData`  | Dữ liệu Bước 3               | Giữ 4 tổng và `rows`; 4 tổng từ BE là authoritative                                                                                 |
| `WizardExpenseData`    | Dữ liệu Bước 4               | Giữ `total_expense`, `rows`; bổ sung breakdown read-only nếu cần render đúng 6 nhóm BE                                              |
| `TaxCalculationResult` | Kết quả hiển thị Bước 5      | Giữ naming FE; map từ preview/submit của BE thay vì tự tính số chính thức                                                           |
| `TaxDeclaration`       | Model lịch sử local hiện tại | Giữ để không phá UI; mapper từ submit/history DTO về model này                                                                      |

### 1.4 Các module phụ thuộc

| Module                  | Phụ thuộc / tác động                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Financial Periods       | Submit thành công làm kỳ chuyển `OPEN` → `CLOSED`; UI lịch sử kỳ phải refresh từ BE                                               |
| Accounting Books        | Dữ liệu chi tiết đang được Step 2–4 dùng để render bảng/XML; sau tích hợp chỉ là dữ liệu enrich UI, không được ghi đè snapshot BE |
| Inventory               | Bước 3 chỉ áp dụng `02_CNKD_TNCN_QTT`; scope không mở rộng flow sản xuất/`RAW_MATERIAL`                                           |
| Vouchers / Expense Book | Bước 4 lấy tổng chi phí từ BE; không tự cộng lại để làm số nộp chính thức                                                         |
| XML/PDF Preview         | Giữ `src/lib/taxXml.ts` và ba component mẫu in; XML client tạo phải khớp preview BE                                               |
| Tax History             | Hiện đọc localStorage; cần endpoint history được BE xác nhận trước khi thay nguồn dữ liệu                                         |

---

## 2. Phát hiện mâu thuẫn BE ↔ FE và giữa hai tài liệu

|   # | Vấn đề                                     | Contract BE / Guide                                                                                                                                      | FE hiện tại                                                                      | Quyết định đề xuất                                                                                                                                                                 |
| --: | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | **Payload submit không thống nhất**        | `API_tax_declaration.md` chỉ có JSON `{ chosenPitMethod }`; Integration Guide yêu cầu `multipart/form-data` gồm `chosenPitMethod`, `xmlContent`, `file?` | FE đã sinh XML nhưng chưa tạo PDF Blob để upload                                 | **BLOCKER:** xác nhận contract BE thật. Mặc định ưu tiên Integration Guide mới hơn: gửi `FormData`, bắt buộc `xmlContent`, bỏ `file` ở MVP vì optional                             |
|   2 | **Endpoint lịch sử không thống nhất**      | Guide có `GET /tax-declaration/history`; tài liệu 15 endpoint không có                                                                                   | `TaxWizardPage` cần danh sách lịch sử sau reload                                 | Không tự thêm endpoint. Chỉ tích hợp history khi BE xác nhận; trước đó mapper cache response submit làm bridge tạm                                                                 |
|   3 | **Kỳ giả không tồn tại ở BE**              | `/start` yêu cầu `periodIdPublicId` thật                                                                                                                 | FE tạo `year-2026`, `tkn-2026-YEAR`, `tkn-2026-FIRST_6_MONTHS`                   | Bỏ gửi ID giả. Drawer chỉ cho chọn kỳ từ `/init.availablePeriods`; nếu BE không tạo kỳ năm/6 tháng thì 01/TKN và 02/QTT chưa thể gọi API                                           |
|   4 | **ID phiên chưa được mô tả rõ**            | `/start` trả `data.id`, step route lại dùng `:publicId`                                                                                                  | FE chỉ có `period_id`                                                            | Tạm coi `data.id` là `sessionPublicId`, persist nó. Cần BE xác nhận `id` này là public ID, không phải internal ID                                                                  |
|   5 | **Nguồn loại tờ khai**                     | `/options/:periodPublicId` quyết định loại hợp lệ theo `taxGroupId`                                                                                      | FE tự quyết bằng `userProfile.tax_group`                                         | Giữ UI drawer nhưng options BE là nguồn cho phép cuối cùng; không render lựa chọn BE không trả về                                                                                  |
|   6 | **Một `taxpayerOption` vs nhiều checkbox** | Save Step 1 chỉ nhận một chuỗi `taxpayerOption`                                                                                                          | 01/CNKD cho phép bật đồng thời 5 boolean `cnkd_*`                                | **BLOCKER nghiệp vụ:** đề xuất đổi nhóm UI sang single-select hoặc mapper chặn khi chọn nhiều; không âm thầm bỏ bớt lựa chọn                                                       |
|   7 | **Field Step 1 không đối xứng**            | BE có `provinceCity`; không có `address`, `phone`, `industry`, `tax_group`, `tax_authority`, `additionNumber`                                            | UI cần các field này và XML đang sử dụng                                         | Merge với `authStore`/draft FE. Các field UI-only vẫn giữ local và đi vào XML; không gửi field ngoài DTO BE                                                                        |
|   8 | **Đơn vị thuế suất**                       | Guide sample trả `vatRate: 1.0`, `pitRate: 0.5` theo đơn vị phần trăm                                                                                    | FE engine lưu tỷ lệ dạng `0.01`, `0.005`                                         | Mapper chuẩn hóa `BE percent / 100 → FE ratio`; UI format nhân `100` khi hiển thị. Không dùng heuristic sau khi contract đã xác nhận                                               |
|   9 | **Bước 2 thiếu chi tiết**                  | BE trả `categoryName`, rate, revenue và tổng; không có category code, channel, invoice rows                                                              | FE cần `category`, `channel`, `rows` cho UI/XML                                  | Map tên ngành thành label; giữ `rows`/channel enrich từ accounting books chỉ để hiển thị. Revenue/rate của BE thắng khi tính/nộp                                                   |
|  10 | **Bước 3 chỉ có aggregate**                | BE chỉ trả 4 giá trị tiền                                                                                                                                | FE cần từng `S05InventoryRow`, có nút Export Excel và dùng rows khi sinh XML QTT | 4 tổng lấy từ BE; detail rows giữ từ accounting books làm UI/XML enrich. Nếu BE yêu cầu XML detail khớp snapshot tuyệt đối thì cần endpoint/response detail bổ sung — không tự bịa |
|  11 | **Bước 4 chỉ có aggregate theo nhóm**      | BE trả tổng và 6 nhóm chi phí                                                                                                                            | FE dùng `S02ExpenseRow[]` để tự nhóm card                                        | Bổ sung `breakdown` trong domain hoặc mapper tạo view model; tổng BE là authoritative, rows local chỉ drill-down                                                                   |
|  12 | **Preview BE vs Tax Engine FE**            | BE trả `pitComparison`, `vatAmount`, YTD và operated industries                                                                                          | FE tự tính toàn bộ bằng `runD3Engine()`                                          | Giữ engine cho test/preview phụ nếu cần, nhưng số hiển thị chính thức và số submit phải map từ BE preview                                                                          |
|  13 | **Phương pháp PIT**                        | Submit chấp nhận `EXEMPT`, `PERCENTAGE`, `PROFIT_15`, `PROFIT_17`, `PROFIT_20`; preview chỉ có một `profitMethodAmount`                                  | UI chỉ cho chọn `PERCENTAGE` hoặc `PROFIT_15`                                    | Cần BE xác nhận rate nào tạo `profitMethodAmount`. Mặc định không mở thêm 17%/20% nếu FE chưa biết phương án nào hợp lệ cho user                                                   |
|  14 | **409 không được retry tự động**           | `DATA_CHANGED` là nhánh nghiệp vụ cần user chọn Force/Ignore                                                                                             | `apiCallWithRetry` tự retry mọi 409                                              | Submit chuẩn phải dùng `apiCall`, không dùng `apiCallWithRetry`; catch 409 và giữ nguyên state để mở modal quyết định                                                              |
|  15 | **Khóa kỳ tại client**                     | BE submit tự đóng kỳ trong transaction                                                                                                                   | FE gọi `markPeriodClosedFromDeclaration()` và tính WAC local                     | Xóa khỏi đường chạy API. Sau submit chỉ nhận `closedPeriod`, map/cache và refetch financial periods                                                                                |
|  16 | **No Optimistic UI cho D3**                | Rule ngoại lệ nhạy cảm bắt buộc chờ BE                                                                                                                   | FE hiện ghi local declaration trước rồi rollback nếu khóa kỳ lỗi                 | Loại bỏ optimistic/upsert-before-submit; hiển thị loading và chỉ commit store/cache khi response BE thành công                                                                     |

> [!CAUTION]
> Các mục **1, 3, 4, 6 và 13** phải được xác nhận trước Execute vì lựa chọn sai có thể gửi tờ khai vào sai kỳ hoặc sai phương pháp tính thuế.

---

## 3. Roadmap theo phase

| Phase | Mục tiêu                                         | API chính                                         | Điều kiện hoàn tất                                                                 |
| :---: | ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
|   0   | Khóa contract và tạo nền DTO/mapper              | Không gọi API mới                                 | Các blocker có quyết định; DTO compile; mapper test được                           |
|   1   | Khởi tạo, chọn kỳ/form, tạo session              | `init`, `options`, `start`                        | FE lưu đúng `periodPublicId` và `sessionPublicId`, không còn ID giả trong API flow |
|   2   | Tích hợp Step 1 và Step 2                        | get/save step 1–2                                 | Profile được merge an toàn; Next chờ snapshot BE thành công                        |
|   3   | Tích hợp Step 3 và Step 4 có điều kiện           | get/save step 3–4                                 | Luồng 3 bước không gọi step 3/4; luồng 5 bước snapshot đúng                        |
|   4   | Preview server và chọn PIT                       | `step-5/preview`                                  | Số thuế/YTD trên UI lấy từ BE, mapper không làm mất domain FE                      |
|   5   | Submit, xử lý biến động và khóa kỳ               | `submit`, `submit-force`, `submit-ignore-warning` | Không optimistic; 409 mở modal; success refresh kỳ và reset draft                  |
|   6   | History bridge, cleanup local logic và hardening | History chỉ khi được xác nhận                     | Reload không hiển thị dữ liệu ma; flow cũ local không còn tham gia số nộp          |

---

## 4. Phase 0 — Thiết kế DTO & Mapper

### 4.1 Tạo `src/types/tax-declaration.dto.ts`

DTO dùng đúng `camelCase` của BE, không dùng trực tiếp trong component. Nhóm type dự kiến:

```typescript
import type { ApiResponse } from './auth.dto';

export type DeclarationFormTypeDTO =
  | '01_TKN_CNKD'
  | '01_CNKD'
  | '02_CNKD_TNCN_QTT';

export type PitMethodDTO =
  | 'EXEMPT'
  | 'PERCENTAGE'
  | 'PROFIT_15'
  | 'PROFIT_17'
  | 'PROFIT_20';

export interface TaxDeclarationPeriodDTO {
  publicId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  deadlineDate: string;
  status: 'OPEN' | 'CLOSED';
  taxAmount: number | string;
  actualPaymentDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDeclarationInitDTO {
  isFirstTime: boolean;
  availablePeriods: TaxDeclarationPeriodDTO[];
}

export interface DeclarationOptionDTO {
  code: DeclarationFormTypeDTO;
  name: string;
}

export interface StartDeclarationRequestDTO {
  periodIdPublicId: string;
  declarationFormType: DeclarationFormTypeDTO;
}

export interface DeclarationSessionDTO {
  id: string;
  userId: string;
  financialPeriodId: number;
  step1Data: Step1ResponseDTO | null;
  step2Data: Step2ResponseDTO | null;
  step3Data: Step3ResponseDTO | null;
  step4Data: Step4ResponseDTO | null;
  createdAt: string;
  updatedAt: string;
}
```

Tiếp tục khai báo đầy đủ:

- `Step1ResponseDTO`, `SaveStep1RequestDTO`.
- `IndustryRevenueDTO`, `Step2ResponseDTO`.
- `Step3ResponseDTO`.
- `Step4ResponseDTO`.
- `Step5PreviewDTO` và `OperatedIndustryDTO`.
- `SubmitDeclarationInput` (FE input trước khi build JSON/FormData).
- `SubmitDeclarationResponseDTO`, `ClosedPeriodDTO`, `SubmittedDeclarationDTO`.
- `DataChangedErrorDTO` cho response 409.
- Wrapper `ApiResponse<T>` tương ứng cho từng endpoint.

`ApiResponse.meta` trong docs có thể là `null`; không sửa shared type vội. Tax service chỉ đọc `data`, hoặc tạo alias tax-specific cho phép `meta?: object | null` nếu TypeScript yêu cầu.

### 4.2 Bổ sung tối thiểu `src/types/tax-wizard.ts`

Không thay domain hiện có bằng DTO. Chỉ bổ sung metadata cần cho server draft:

```typescript
interface TaxDeclarationForm {
  // ...domain hiện tại
  session_id: string;
  snapshot_status: {
    step1: 'IDLE' | 'LOADING' | 'SAVED' | 'ERROR';
    step2: 'IDLE' | 'LOADING' | 'SAVED' | 'ERROR';
    step3: 'IDLE' | 'LOADING' | 'SAVED' | 'SKIPPED' | 'ERROR';
    step4: 'IDLE' | 'LOADING' | 'SAVED' | 'SKIPPED' | 'ERROR';
  };
  preview: WizardPreviewData | null;
}
```

`WizardProfileData` có thể thêm `province_city?: string`; không ép `provinceCity` vào `address` vì hai khái niệm không tương đương.

### 4.3 Tạo `src/services/tax-declaration.mapper.ts`

Mapper dự kiến:

| Hàm                                   | Mapping chính                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mapDeclarationPeriodDTOToFE`         | Tái sử dụng logic ngày của `period.mapper.ts`; `publicId → id`, money qua `toSafeNumber`                                          |
| `mapStep1DTOToFE(dto, cachedProfile)` | `taxCode → mst`, `cccdNumber → cccd`, `businessName → business_name`, `ownerName → owner_name`; merge field UI-only từ cache/auth |
| `mapProfileToSaveStep1DTO(profile)`   | Chỉ gửi đúng whitelist BE; map label option và auth/agent fields                                                                  |
| `mapStep2DTOToFE(dto, localRows?)`    | `confirmedRevenue → total_revenue`; rate percent → ratio; giữ rows enrich nhưng totals BE thắng                                   |
| `mapStep3DTOToFE(dto, localRows?)`    | 4 field camelCase → 4 field snake_case; rows chỉ enrich                                                                           |
| `mapStep4DTOToFE(dto, localRows?)`    | Tổng + 6 nhóm; không tự tính lại total chính thức                                                                                 |
| `mapPreviewDTOToFE(dto)`              | Map period, snapshot, PIT comparison, VAT, YTD, industries về view model FE                                                       |
| `mapSubmitResponseDTOToFE(dto)`       | Map declaration BE về `TaxDeclaration`; map `closedPeriod` về `FinancialPeriod`                                                   |

Quy tắc mapper:

- Mọi monetary field chạy qua `toSafeNumber()` từ `inbound-invoice.mapper.ts`.
- Date string chỉ normalize để hiển thị; không đổi timezone tùy tiện.
- Không dùng `as any` để che contract sai.
- Field BE thiếu dùng cached/default có chủ đích và comment rõ `FE-only`.
- Server totals luôn thắng local calculation ở Step 2–5.

---

## 5. Phase 0 — Xử lý số liệu (Currency Parsing)

### 5.1 Monetary fields bắt buộc parser

| DTO field                                                                              | FE field                  | Quy tắc                                     |
| -------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------- |
| `taxAmount`                                                                            | `tax_amount`              | `toSafeNumber`, không làm tròn trong mapper |
| `revenue`, `confirmedRevenue`                                                          | `amount`, `total_revenue` | `toSafeNumber`                              |
| `estimatedVat`, `vatAmount`                                                            | `vat_amount`              | `toSafeNumber`                              |
| `openingValue`, `importedValue`, `exportedValue`, `closingValue`                       | inventory totals          | `toSafeNumber`                              |
| `totalExpense`, `chiPhi*`                                                              | expense total/breakdown   | `toSafeNumber`                              |
| `profitMethodAmount`, `percentageMethodAmount`                                         | PIT comparison            | `toSafeNumber`                              |
| `ytdRevenue`, `ytdExpense`, `ytdExemption`, `ytdTaxableRevenue`                        | preview/YTD               | `toSafeNumber`                              |
| `declaredRevenue`, `declaredExpense`, `vatTaxAmount`, `pitTaxAmount`, `totalTaxAmount` | `TaxDeclaration`          | `toSafeNumber`                              |

### 5.2 Rate convention

- BE sample: `1.0` nghĩa là `1%`, `0.5` nghĩa là `0.5%`.
- FE calculation convention: `0.01` và `0.005`.
- Mapper: `rate / 100`.
- UI: `rate * 100` trước khi thêm ký hiệu `%`.
- Không round tiền trong mapper; chỉ format bằng `toLocaleString('vi-VN')` ở UI.

---

## 6. Phase 1 — Init, Options và Start Session

### 6.1 Cập nhật `src/config/api.config.ts`

Chỉ thêm đúng 15 endpoint đã có:

```typescript
TAX_DECLARATION: {
  INIT: '/v1/tax-declaration/init',
  OPTIONS: (periodId: string) => `/v1/tax-declaration/options/${periodId}`,
  START: '/v1/tax-declaration/start',
  STEP_1: (sessionId: string) => `/v1/tax-declaration/step-1/${sessionId}`,
  SAVE_STEP_1: (sessionId: string) => `/v1/tax-declaration/step-1/save/${sessionId}`,
  STEP_2: (sessionId: string) => `/v1/tax-declaration/step-2/${sessionId}`,
  SAVE_STEP_2: (sessionId: string) => `/v1/tax-declaration/step-2/save/${sessionId}`,
  STEP_3: (sessionId: string) => `/v1/tax-declaration/step-3/${sessionId}`,
  SAVE_STEP_3: (sessionId: string) => `/v1/tax-declaration/step-3/save/${sessionId}`,
  STEP_4: (sessionId: string) => `/v1/tax-declaration/step-4/${sessionId}`,
  SAVE_STEP_4: (sessionId: string) => `/v1/tax-declaration/step-4/save/${sessionId}`,
  PREVIEW: (sessionId: string) => `/v1/tax-declaration/step-5/preview/${sessionId}`,
  SUBMIT: (sessionId: string) => `/v1/tax-declaration/submit/${sessionId}`,
  SUBMIT_FORCE: (sessionId: string) => `/v1/tax-declaration/submit-force/${sessionId}`,
  SUBMIT_IGNORE_WARNING: (sessionId: string) =>
    `/v1/tax-declaration/submit-ignore-warning/${sessionId}`,
},
```

Không thêm `/history` cho đến khi contract chính thức xác nhận.

### 6.2 Refactor `src/services/tax-wizard.service.ts`

Tách call API thuần khỏi local calculation. Các hàm Phase 1:

| Hàm                                             | Wrapper   | Hành vi                                        |
| ----------------------------------------------- | --------- | ---------------------------------------------- |
| `initializeTaxDeclaration()`                    | `apiCall` | `GET init`, map `availablePeriods`             |
| `getDeclarationOptions(periodPublicId)`         | `apiCall` | `GET options`, trả options DTO/domain          |
| `startTaxDeclaration(periodPublicId, formType)` | `apiCall` | `POST start`, trả `sessionPublicId` và session |

Không fallback sang synthetic period/local session khi API lỗi. Với D3, lỗi mạng phải hiện rõ và chặn đi tiếp.

### 6.3 Cập nhật `src/store/taxWizardStore.ts`

State mới dự kiến:

```typescript
interface TaxWizardState {
  initData: TaxDeclarationInitData | null;
  declarationOptions: DeclarationOption[];
  selectedPeriodId: string | null;
  sessionPublicId: string | null;
  isInitializing: boolean;
  isSavingStep: boolean;
  isSubmitting: boolean;
  error: TaxDeclarationError | null;
  submitConflict: DataChangedConflict | null;
  // ...state/actions hiện tại
}
```

Persist chỉ:

- `sessionPublicId`, `selectedPeriodId`, `currentStep`.
- Metadata kỳ và profile UI-only cần khôi phục.
- Không persist snapshot totals/preview server như nguồn chính; reload phải GET lại step tương ứng.

### 6.4 Ráp Phase 1 vào `TaxWizardPage.tsx`

- Khi không có active session: gọi `init`.
- Drawer lấy kỳ từ `init.availablePeriods`, không tạo `year-*`/`tkn-*`.
- Khi user chọn kỳ: gọi `options(periodPublicId)` rồi chỉ render options BE trả về.
- Nút **Bắt đầu kê khai**:
  1. Disable và loading.
  2. Gọi `start`.
  3. Lưu `periodPublicId` + `sessionPublicId`.
  4. Khởi tạo domain form và vào Step 1.
- Không dùng `canSubmitDeclarationForPeriod()` local làm guard cuối; trạng thái kỳ từ init/BE là authority.

---

## 7. Phase 2 — Step 1 & Step 2

### 7.1 Step 1 — Profile

Service actions:

- `getDeclarationStep1(sessionPublicId)` → `GET step-1`.
- `saveDeclarationStep1(sessionPublicId, profile)` → mapper whitelist → `POST save step-1`.

UI flow:

1. Enter Step 1: tải dữ liệu BE và merge với `authStore`/draft FE.
2. Field BE trả về là default chính thức; field FE-only vẫn giữ nguyên.
3. Nút Next validate business name và quy tắc `taxpayerOption`.
4. Set loading, chờ save thành công, map session response vào store rồi mới chuyển Step 2.
5. Save lỗi: giữ nguyên form, hiển thị message, không đổi step.

Mapping option:

- `filing_mode: FIRST` ↔ `declarationTypeOption: "Tờ khai lần đầu"`.
- `filing_mode: ADD` ↔ `declarationTypeOption: "Tờ khai bổ sung"`.
- `period_option` / `cnkd_period_option` ↔ label `Năm`, `Tháng`, `Quý`, `Lần phát sinh`, `6 tháng đầu năm`, `6 tháng cuối năm`.
- Auth/agent fields map 1–1 sang `authorizedFiler*` và `taxAgent*`.
- `addition_number` vẫn FE/XML-only vì BE request không có field tương ứng.

### 7.2 Step 2 — Revenue Snapshot

Service actions:

- `getDeclarationStep2(sessionPublicId)` → `GET step-2`.
- `saveDeclarationStep2(sessionPublicId)` → `POST save step-2`, body rỗng.

UI flow:

1. Enter Step 2: GET dữ liệu server.
2. Render `confirmedRevenue`, `industries`, `estimatedVat`, `transactionCount`.
3. Có thể enrich `rows` từ accounting books để drill-down, nhưng không thay tổng BE.
4. Nút Next gọi save snapshot, chờ response.
5. Thành công:
   - `02_CNKD_TNCN_QTT` → Step 3.
   - `01_CNKD` / `01_TKN_CNKD` → Step 5.

---

## 8. Phase 3 — Step 3 & Step 4 có điều kiện

### 8.1 Guard luồng 3 bước / 5 bước

Tạo helper duy nhất:

```typescript
function isFullDeclarationFlow(formType: DeclarationFormTypeDTO): boolean {
  return formType === '02_CNKD_TNCN_QTT';
}
```

- Chỉ `02_CNKD_TNCN_QTT` được gọi Step 3/4.
- `01_CNKD` và `01_TKN_CNKD` đánh dấu step 3/4 là `SKIPPED`.
- Không gọi thử rồi dựa vào lỗi `STEP_NOT_APPLICABLE`; chặn từ FE trước.

### 8.2 Step 3 — Inventory Snapshot

- Enter: `GET step-3`, map 4 tổng BE.
- Rows chi tiết từ accounting books chỉ dùng cho bảng/export/XML enrich.
- Nút Next: `POST save step-3` body rỗng, chờ response rồi sang Step 4.
- Không gọi hoặc mở rộng nghiệp vụ sản xuất/`RAW_MATERIAL`; chỉ hiển thị aggregate BE và dữ liệu `FINISHED_GOOD` hiện có.

### 8.3 Step 4 — Expense Snapshot

- Enter: `GET step-4`.
- Hiển thị `totalExpense` và 6 nhóm chi phí BE.
- Rows local chỉ drill-down; không cộng lại để ghi đè `totalExpense`.
- Nút Next: `POST save step-4` body rỗng, chờ response rồi sang Step 5.

---

## 9. Phase 4 — Step 5 Preview từ BE

### 9.1 Service

`getDeclarationPreview(sessionPublicId)` gọi `GET step-5/preview` qua `apiCall` và mapper:

- Map `step1Data`–`step4Data` để preview/XML dùng đúng snapshot.
- Map `pitComparison` thành A/B result FE.
- Map `vatAmount`, `ytdRevenue`, `ytdExpense` và `operatedIndustries`.
- `step3Data`/`step4Data` được phép `null` ở luồng 3 bước.

### 9.2 UI `Step5_AI_Optimizer.tsx`

- Thay effect tự gọi `calculateYTD*`/`runD3Engine()` bằng action fetch preview.
- Giữ layout A/B testing và mẫu in hiện tại.
- `percentageMethodAmount` và `profitMethodAmount` từ BE là số chính thức.
- Khi đổi phương pháp, chỉ chọn amount tương ứng; không tự tính lại snapshot.
- VAT và YTD hiển thị từ preview BE.
- Nút xem XML vẫn dùng `taxXml.ts`, nhưng input phải được dựng từ mapped snapshot server.
- Nếu preview thiếu step bắt buộc, chặn submit và điều hướng về step chưa snapshot.

---

## 10. Phase 5 — Submit, `DATA_CHANGED` và khóa kỳ

### 10.1 Service submit

Tạo ba hàm explicit để tránh gọi nhầm endpoint:

| Hàm                                 | Endpoint                            | Wrapper                         |
| ----------------------------------- | ----------------------------------- | ------------------------------- |
| `submitTaxDeclaration`              | `/submit/:sessionId`                | `apiCall` — **không retry 409** |
| `submitTaxDeclarationForce`         | `/submit-force/:sessionId`          | `apiCall`                       |
| `submitTaxDeclarationIgnoreWarning` | `/submit-ignore-warning/:sessionId` | `apiCall`                       |

Builder request phụ thuộc kết quả xác nhận contract:

- Nếu multipart là contract thật: `FormData.append('chosenPitMethod', ...)`, `FormData.append('xmlContent', ...)`, file PDF optional.
- Nếu JSON là contract thật: gửi đúng body được BE xác nhận; không tự thêm field.

MVP không upload PDF vì UI hiện chỉ `window.print()`, chưa có pipeline tạo PDF Blob ổn định. Nếu BE cần file bắt buộc, tách task bổ sung dùng `html2canvas` + `jsPDF` và kiểm thử layout.

### 10.2 State machine submit

```text
IDLE → SUBMITTING → SUCCESS
                  ↘ DATA_CHANGED → WAITING_USER
                                   ├─ FORCE_SUBMITTING → SUCCESS
                                   └─ IGNORE_SUBMITTING → SUCCESS
                  ↘ ERROR → IDLE
```

Quy tắc bắt buộc:

- Không optimistic update.
- Disable cả Back/Submit khi request đang chạy.
- Response 409 `DATA_CHANGED`: không reset wizard, không tự retry, lưu conflict vào store và mở modal.
- Modal hiển thị `draftData.revenue/expense` so với `realTimeData.revenue/expense`.
- **Đồng bộ số liệu mới** gọi Force.
- **Giữ số liệu cũ** cần confirm lần hai rồi gọi Ignore Warning.
- Success:
  1. Map `closedPeriod` và `declaration`.
  2. Cache response sau thành công nếu history API chưa có.
  3. Refetch `getFinancialPeriods()`.
  4. Reset server-session pointer/local draft.
  5. Navigate `/tax/history`.

### 10.3 Không dùng khóa kỳ local

Xóa khỏi API path:

- `generateDeclarationId()`.
- Upsert local declaration trước request.
- `markPeriodClosedFromDeclaration()` khi ký nộp.
- Local calculation WAC/period close trong Tax Wizard.

Các logic này có thể giữ tạm cho module mock khác nhưng Tax Wizard API không được gọi đến chúng.

---

## 11. Phase 6 — History bridge, cleanup và error handling

### 11.1 History

Phương án theo thứ tự ưu tiên:

1. Nếu BE xác nhận `GET /v1/tax-declaration/history`: bổ sung DTO/service/mapper và thay `getDeclarations()` local.
2. Nếu chưa có endpoint: chỉ cache các declaration submit thành công trên chính thiết bị; UI phải ghi rõ đây là cache cục bộ và refetch periods để lấy trạng thái kỳ.
3. Không tự suy luận đầy đủ history từ financial periods vì period response thiếu XML và các số declared chi tiết.

### 11.2 Error matrix

| Error / HTTP                       | Nơi xảy ra           | Message FE                                           | Xử lý state                                                             |
| ---------------------------------- | -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `STEP_NOT_APPLICABLE` / 400        | Step 3/4             | “Bước này không áp dụng cho loại tờ khai đã chọn.”   | Đánh dấu `SKIPPED`, đưa về step hợp lệ; log vì guard FE đáng ra đã chặn |
| `FINANCIAL_PERIOD_IS_CLOSED` / 400 | Start/save/submit    | “Kỳ kế toán đã đóng, không thể tiếp tục kê khai.”    | Không đổi snapshot; refetch init/periods                                |
| `DATA_CHANGED` / 409               | Submit chuẩn         | “Số liệu đã thay đổi sau lần xác nhận gần nhất.”     | Mở conflict modal, không retry                                          |
| 401                                | Mọi API              | Theo `http-client` refresh token                     | Nếu refresh thất bại → login                                            |
| 403                                | Mọi API              | “Bạn không có quyền thực hiện thao tác kê khai này.” | Giữ draft, dừng loading                                                 |
| 404                                | Session/period       | “Phiên kê khai hoặc kỳ thuế không còn tồn tại.”      | Xóa session pointer hỏng, quay về init                                  |
| 422 / validation                   | Save Step 1 / Submit | Hiển thị message BE tại field hoặc banner            | Giữ nguyên form                                                         |
| 500+                               | Mọi API              | “Lỗi hệ thống, vui lòng thử lại sau.”                | Không mutate dữ liệu đã xác nhận                                        |

### 11.3 Cleanup

- Đổi comment “fresh fetch từ accounting-books” thành “fresh fetch từ Tax Declaration API” ở các step chính.
- Không còn `sleep()` trong tax service.
- Không còn `ftax_tax_declarations` là nguồn chính thức.
- Không còn ID kỳ synthetic trong request API.
- Giữ `taxXml.ts` và declaration print components làm FE SSOT về template trình bày.

---

## 12. Test Plan

### 12.1 Unit tests

- Mapper Step 1 giữ field FE-only nhưng map đúng whitelist BE.
- Rate `1.0 → 0.01`, `0.5 → 0.005`.
- Tất cả money string/number/null qua `toSafeNumber` an toàn.
- Step 2–4 server totals thắng local rows totals.
- Preview map đúng nullable step 3/4.
- Submit response map đúng `closedPeriod.status = CLOSED`.
- Error parser nhận đúng `DATA_CHANGED` và chi tiết draft/realtime.

### 12.2 Store tests

- Init → options → start lưu tách `periodPublicId`/`sessionPublicId`.
- Reload với persisted session fetch lại step data, không dùng stale snapshot.
- 3-step flow đi `1 → 2 → 5`, không gọi API Step 3/4.
- 5-step flow đi `1 → 2 → 3 → 4 → 5`.
- Save step lỗi không đổi `currentStep`.
- Submit 409 không retry và không reset wizard.
- Force/Ignore success mới reset state.

### 12.3 Manual scenarios

1. **Tax group miễn thuế:** init → option chỉ có `01_TKN_CNKD` → flow 1–2–5.
2. **Tax group thường — 01/CNKD:** chọn kỳ OPEN → start → save step 1/2 → preview → submit.
3. **02/CNKD-TNCN-QTT:** thực hiện đủ 5 bước; xác minh 4 tổng kho và 6 nhóm chi phí đúng response BE.
4. **Refresh giữa wizard:** reload tại từng step; session tiếp tục bằng `sessionPublicId`, dữ liệu được GET lại.
5. **Step not applicable:** bảo đảm Network tab không có request step 3/4 ở luồng 3 bước.
6. **Data changed:** sửa hóa đơn/chi phí sau snapshot; submit trả 409; modal hiển thị đúng số cũ/mới.
7. **Force:** chọn đồng bộ số mới; response success, kỳ CLOSED và totals mới được hiển thị.
8. **Ignore warning:** chọn giữ số cũ, confirm lần hai; response success và UI không thay snapshot trước khi BE trả về.
9. **Network failure:** ngắt mạng khi save/submit; current step và draft không bị mất.
10. **Closed period:** kỳ đóng không xuất hiện như lựa chọn hợp lệ hoặc BE chặn với message đúng.
11. **Auth:** access token hết hạn được refresh một lần; request step tiếp tục thành công.
12. **XML:** XML sinh từ snapshot preview, đúng loại biểu mẫu và phương pháp PIT đã chọn.

### 12.4 Static checks

- `npm run lint`
- `npm run build`
- Nếu bổ sung test files: chạy Vitest trực tiếp vì `package.json` hiện chưa khai báo script `test`.

---

## 13. Thứ tự file dự kiến thay đổi khi Execute

| Thứ tự | File                                                | Loại thay đổi                                                               |
| -----: | --------------------------------------------------- | --------------------------------------------------------------------------- |
|      1 | `src/types/tax-declaration.dto.ts`                  | Tạo mới DTO contract                                                        |
|      2 | `src/types/tax-wizard.ts`                           | Bổ sung session/snapshot/preview domain tối thiểu                           |
|      3 | `src/services/tax-declaration.mapper.ts`            | Tạo mới mapper BE ↔ FE                                                      |
|      4 | `src/config/api.config.ts`                          | Thêm đúng 15 route                                                          |
|      5 | `src/services/tax-wizard.service.ts`                | Thay local calculation/submit bằng API orchestration                        |
|      6 | `src/store/taxWizardStore.ts`                       | Thêm async actions, loading/error/conflict state; không optimistic          |
|      7 | `src/pages/tax/wizard/TaxWizardPage.tsx`            | Init/options/start, loại synthetic ID khỏi API flow                         |
|      8 | `src/pages/tax/wizard/steps/Step1_Profile.tsx`      | GET/save Step 1 và validation option                                        |
|      9 | `src/pages/tax/wizard/steps/Step2_Revenue.tsx`      | GET/save Step 2 snapshot                                                    |
|     10 | `src/pages/tax/wizard/steps/Step3_Inventory.tsx`    | GET/save Step 3 và guard 5-step                                             |
|     11 | `src/pages/tax/wizard/steps/Step4_Expense.tsx`      | GET/save Step 4 và breakdown BE                                             |
|     12 | `src/pages/tax/wizard/steps/Step5_AI_Optimizer.tsx` | Preview BE, submit state machine, conflict modal                            |
|     13 | `src/lib/taxXml.ts`                                 | Chỉ chỉnh mapper input nếu snapshot field thay đổi; không viết lại template |
|     14 | `src/services/financial-period.service.ts`          | Bỏ đường khóa kỳ local khỏi Tax Wizard; giữ API period hiện có              |
|     15 | `src/tests/*`                                       | Bổ sung mapper/store/integration tests                                      |

---

## 14. Assumptions & Defaults chờ xác nhận

1. Global prefix của BE là `/v1`, đồng nhất với toàn bộ `API_ROUTES` hiện tại.
2. `data.id` từ `/start` là ID công khai hợp lệ cho các route step/submit.
3. Submit dùng multipart theo Integration Guide; `file` PDF là optional và chưa gửi ở MVP.
4. `vatRate`/`pitRate` BE dùng đơn vị phần trăm (`1.0 = 1%`).
5. Server preview/snapshot là nguồn số liệu chính thức; FE Tax Engine chỉ còn vai trò hỗ trợ hiển thị/test, không quyết định số nộp.
6. Không dùng Optimistic UI, offline submit hoặc auto-retry 409 trong toàn bộ D3.
7. Detail rows Step 2–4 chỉ là enrich UI; nếu XML bắt buộc detail khớp snapshot, cần BE cung cấp detail tương ứng.
8. Không tự thêm `/tax-declaration/history` khi endpoint chưa được xác nhận trong API contract chính.
9. Không mở rộng nghiệp vụ sản xuất/`RAW_MATERIAL`; chỉ giữ aggregate BE cần cho tờ khai và dữ liệu `FINISHED_GOOD`/`SERVICE` hiện có.

---

> [!IMPORTANT]
> Bản kế hoạch đã sẵn sàng, bạn hãy review. Trước khi Execute, vui lòng xác nhận các blocker ở Mục 2 — đặc biệt payload submit, ID session, kỳ năm/6 tháng và quy tắc `taxpayerOption`. Nếu OK, vui lòng phản hồi **“Duyệt”** hoặc **“Execute”** để bắt đầu viết code.
