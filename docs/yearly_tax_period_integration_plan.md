# 📋 Phân Tích & Giải Pháp Kỹ Thuật: Tích Hợp Kỳ Thuế Năm (YEARLY) & Luồng Bán Niên (HALF_YEARLY)
**Ngày lập:** 2026-06-30  
**Tác giả:** Antigravity (AI Pair Programmer)  
**Tập trung làm rõ:** Hướng thiết lập mặc định kỳ tính thuế ở Onboarding, giải pháp truy xuất startAt/endAt cho các option thời gian trong năm (năm, nửa đầu/cuối năm), và phân tích đánh giá tác động/khả thi khi tích hợp kỳ thuế Năm (`YEARLY`) vào hệ thống.

---

## 1. Hướng Thiết Lập Mặc Định ở Onboarding & Xử Lý Option Thời Gian

### 1.1. Thiết lập mặc định FilingPeriod tại Onboarding
Đối với người dùng thuộc nhóm doanh thu miễn thuế (`taxGroupId === 1` - doanh thu năm $\le$ 100 triệu), biểu mẫu kê khai hợp lệ duy nhất của họ là **`01_TKN_CNKD`** (Tờ khai năm).
* **Giải pháp backend:**
  - Trong logic hàm `setupTaxConfiguration` (`src/onboarding/onboarding.service.ts`), nếu người dùng gửi `taxGroupId: 1`, hệ thống sẽ tự động gán mặc định trường **`vatFilingPeriod`** trong bảng `TaxConfiguration` là **`YEARLY`** (thay vì mặc định `QUARTERLY`).
  - Kỳ tài chính đầu tiên được sinh ra thông qua `createInitialPeriod` lúc này sẽ tự động mang cấu hình `vatFilingPeriod = YEARLY`.

### 1.2. Giải pháp truy xuất startAt/endAt theo Option Kỳ tính thuế (Step 1)
Khi người dùng thuộc nhóm miễn thuế thực hiện kê khai Bước 1, họ có 3 tùy chọn trong `taxPeriodOption`:
1. **"Năm" (YEAR)**: Xem/kê khai cho toàn bộ năm tài chính.
2. **"6 tháng đầu năm" (FIRST_6_MONTHS)**: Xem/kê khai cho nửa đầu năm.
3. **"6 tháng cuối năm" (LAST_6_MONTHS)**: Xem/kê khai cho nửa cuối năm.

#### Cơ chế ánh xạ thời gian (Time Mapping Scheme):
Để tính toán số liệu doanh thu và các thông tin liên quan, Backend sẽ ánh xạ từ lựa chọn của người dùng trong draft (`step1Data.taxPeriodOption`) kết hợp với ngày bắt đầu kỳ hiện hành (`startDate`) để sinh ra cặp mốc thời gian `startAt` và `endAt` tương ứng:

```typescript
const startOfYear = moment(period.startDate).startOf('year');

let startAt: Date;
let endAt: Date;

if (taxPeriodOption === '6 tháng đầu năm') {
  startAt = startOfYear.clone().toDate(); // 01-01
  endAt = startOfYear.clone().month(5).endOf('month').toDate(); // 30-06
} else if (taxPeriodOption === '6 tháng cuối năm') {
  startAt = startOfYear.clone().month(6).startOf('month').toDate(); // 01-07
  endAt = startOfYear.clone().endOf('year').toDate(); // 31-12
} else {
  // Mặc định là 'Năm' hoặc khớp với cấu hình kỳ của người dùng
  startAt = startOfYear.clone().toDate(); // 01-01
  endAt = startOfYear.clone().endOf('year').toDate(); // 31-12
}
```

#### Tối ưu hóa truy vấn kỳ tài chính (Period ID Resolution):
* Nếu tùy chọn thời gian do người dùng chọn (`taxPeriodOption`) **khớp hoàn toàn** với kỳ tài chính thực tế đang mở của họ (ví dụ: họ có cấu hình kỳ tính thuế là năm `YEARLY` và họ chọn option tính thuế là `"Năm"`), hệ thống sẽ **truy xuất trực tiếp bằng ID của kỳ tài chính** (`period.id`) thay vì chạy các query lọc theo khoảng thời gian (`startDate` và `endDate`). 
* Cách này giúp tăng tốc độ truy vấn cơ sở dữ liệu và tận dụng tối đa cơ chế index khóa chính của Postgres.

---

## 2. Đánh Giá Tác Động & Tính Khả Thi Khi Tích Hợp Kỳ Thuế Năm (`YEARLY`)

Hiện tại, hệ thống kỳ tài chính của Backend chủ yếu hoạt động dựa trên hai đơn vị chu kỳ là **Tháng (`MONTHLY`)** và **Quý (`QUARTERLY`)**. Việc mở rộng hỗ trợ kỳ thuế **Năm (`YEARLY`)** và **Bán Niên (`HALF_YEARLY`)** là hoàn toàn khả thi do cấu trúc cơ sở dữ liệu đã khai báo Enum `FilingPeriod` có sẵn hai giá trị này. Tuy nhiên, chúng ta cần tinh chỉnh một số logic nghiệp vụ để tránh các tác động tiêu cực:

### 2.1. Đánh giá tác động đến các module hệ thống

#### 1. Module Kỳ tài chính (`financial-periods`):
* **Tính toán ngày hết hạn nộp thuế (Deadline Date):**
  - Hiện tại, deadline của tháng là ngày 20 tháng sau, quý là ngày cuối cùng tháng đầu tiên quý sau.
  - Luật thuế quy định đối với tờ khai năm (`01_TKN_CNKD`), thời hạn nộp hồ sơ khai thuế muộn nhất là **ngày cuối cùng của tháng thứ 3** kể từ ngày kết thúc năm dương lịch (tức ngày 31/03 năm sau).
  - *Tác động:* Cần cập nhật hàm `calculatePeriodMetadata` để sinh đúng deadline ngày 31/03 cho kỳ `YEARLY`.
* **Ràng buộc kỳ mở trước đó (Previous Open Period Guard):**
  - Hàm `getOrCreateAndValidatePeriod` chặn không cho tạo kỳ mới nếu tồn tại bất kỳ kỳ nào trước đó chưa được đóng (`status = OPEN`).
  - Nếu người dùng có kỳ tính thuế năm `YEARLY`, kỳ đó sẽ mở suốt 12 tháng.
  - *Tác động:* Logic kiểm tra `isPreviousOpenPeriod` cần tính đến trường hợp các hóa đơn phát sinh trong năm sẽ rơi vào chính kỳ năm đó, không kích hoạt tự động sinh kỳ tháng/quý.

#### 2. Module Hóa đơn (`invoices`):
* Hóa đơn khi được phát hành (`ISSUED`) sẽ tự động liên kết với kỳ tài chính tương ứng chứa ngày lập hóa đơn đó (`ensurePeriodExists`).
* Nếu HKD đang có cấu hình là `YEARLY`, tất cả các hóa đơn phát sinh trong năm (ví dụ từ 01/01/2026 đến 31/12/2026) đều sẽ được gán chung vào 1 ID kỳ năm 2026.
* *Đánh giá:* **Hợp lệ**, không phá vỡ logic liên kết hóa đơn hiện tại.

#### 3. Module Kho hàng & Giá vốn (`cost-engine` & `stocks`):
* Thuật toán tính giá vốn bình quân gia quyền cuối kỳ (`calculateAndApplyWeightedAverageCosts`) chạy khi chốt kỳ kế toán.
* Nếu kỳ kế toán kéo dài 1 năm (`YEARLY`), giá vốn bình quân gia quyền sẽ được tính gộp cho cả năm thay vì từng tháng/quý.
* *Tác động:* Người dùng sẽ chỉ xem được giá vốn chính xác sau khi kết thúc năm tài chính và chốt sổ kỳ năm. Trong năm, hệ thống sẽ sử dụng đơn giá tạm tính. Điều này hoàn toàn phù hợp với thực tế hộ kinh doanh nhỏ lẻ tự khai thuế năm.

---

## 3. Kế Hoạch Chỉnh Sửa Logic Ở Backend

Để hỗ trợ đầy đủ các yêu cầu trên, chúng ta cần thực hiện các chỉnh sửa mã nguồn Backend sau:

### 3.1. Cập nhật `calculatePeriodMetadata` (`src/financial-periods/financial-periods.service.ts`)
Bổ sung logic tính toán ngày bắt đầu, ngày kết thúc và hạn nộp thuế cho `YEARLY` và `HALF_YEARLY`:

```typescript
private calculatePeriodMetadata(issueDate: Date, filingPeriod: FilingPeriod) {
  const now = moment(issueDate);
  let start: Dayjs;
  let end: Dayjs;
  let deadline: Dayjs;
  let periodName: string;

  if (filingPeriod === 'YEARLY') {
    start = now.clone().startOf('year');
    end = now.clone().endOf('year');
    // Hạn nộp là ngày 31/03 năm sau
    deadline = end.clone().add(3, 'months').date(31).endOf('day');
    periodName = `Năm ${now.year()}`;
  } else if (filingPeriod === 'HALF_YEARLY') {
    const isFirstHalf = now.month() < 6;
    start = isFirstHalf ? now.clone().startOf('year') : now.clone().month(6).startOf('month');
    end = isFirstHalf ? now.clone().month(5).endOf('month') : now.clone().endOf('year');
    // Hạn nộp là ngày cuối cùng của tháng kế tiếp bán niên
    deadline = end.clone().add(1, 'month').endOf('month').endOf('day');
    periodName = isFirstHalf ? `6 tháng đầu năm ${now.year()}` : `6 tháng cuối năm ${now.year()}`;
  } else {
    // Logic cho MONTHLY và QUARTERLY giữ nguyên
    const unit: 'quarter' | 'month' = filingPeriod === 'QUARTERLY' ? 'quarter' : 'month';
    start = now.clone().startOf(unit);
    end = now.clone().endOf(unit);
    
    if (filingPeriod === 'MONTHLY') {
      deadline = end.clone().add(1, 'month').date(20).endOf('day');
    } else {
      deadline = end.clone().add(1, 'month').endOf('month').endOf('day');
    }
    periodName = filingPeriod === 'QUARTERLY' ? `Quý ${now.quarter()}/${now.year()}` : `Tháng ${now.format('MM/YYYY')}`;
  }

  // Dời hạn nộp nếu rơi vào cuối tuần
  while (deadline.day() === 6 || deadline.day() === 0) {
    deadline = deadline.add(1, 'day');
  }

  return {
    start: start.toDate(),
    end: end.toDate(),
    deadline,
    periodName,
  };
}
```

### 3.2. Cập nhật Onboarding setup (`src/onboarding/onboarding.service.ts`)
Gán `vatFilingPeriod` là `YEARLY` nếu người dùng chọn `taxGroupId === 1`:

```typescript
const newConfig = await tx.taxConfiguration.create({
  data: {
    userId: userId,
    industryId: finalCategoryId,
    taxGroupId: dto.taxGroupId,
    chosenPitMethod: defaultPitMethod,
    applyFromDate: dto.taxGroupId === 1 
      ? moment(now).startOf('year').toDate() 
      : moment(now).startOf('quarter').toDate(),
    applyToDate: MAX_EFFECTIVE_DATE,
    vatRateSnapShot: taxRates.vatRate,
    pitRateSnapShot: this.mapPitMethodToRate(defaultPitMethod, taxRates.pitRate),
    vatFilingPeriod: dto.taxGroupId === 1 ? 'YEARLY' : 'QUARTERLY', // Gán kỳ thuế năm cho nhóm 1
  },
});
```
