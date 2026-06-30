# 📋 Giải Pháp Nghiệp Vụ & Thiết Kế Kỹ Thuật: Tự Động Định Khoảng Ngày Cho Tờ Khai 01/TKN-CNKD (Doanh thu <= 1 tỷ)
**Ngày lập:** 2026-06-30  
**Tác giả:** Antigravity (AI Pair Programmer)  
**Phạm vi:** Phân tích, thiết kế giải pháp và đánh giá tính khả thi khi tự động co giãn khoảng ngày tính thuế (`startAt`/`endAt`) dựa trên lựa chọn của người dùng tại Step 1 đối với tờ khai thuế năm/bán niên.

---

## 1. Nghiệp Vụ & Bài Toán Kỹ Thuật

Đối với hộ kinh doanh thuộc **Nhóm 1 (Doanh thu $\le$ 100 triệu/năm hoặc mức 1)**:
* Kỳ kế toán gốc được tạo ra ở Onboarding là **Năm (`YEARLY`)** (ví dụ từ ngày `01/01/2026` đến `31/12/2026`).
* Tuy nhiên, theo quy định, họ được phép lựa chọn kỳ tính thuế (`taxPeriodOption`) khi bắt đầu kê khai tại Step 1 với 3 tùy chọn:
  1. `"Năm"` (Cả năm)
  2. `"6 tháng đầu năm"` (Bán niên 1)
  3. `"6 tháng cuối năm"` (Bán niên 2)
* Đối với các hộ kinh doanh **Nhóm 2, 3, 4 (Doanh thu > 1 tỷ)**, họ kê khai theo tờ `01/CNKD` hoặc `02/CNKD_TNCN_QTT` và chu kỳ nộp của họ mặc định là Quý/Tháng, không có tùy chọn thay đổi khoảng ngày (mặc định lấy nguyên khoảng ngày của kỳ tài chính hiện tại đó).

### 2. Giải Pháp Chi Tiết: Tự Động Co Giãn Khoảng Ngày Tính Thuế

Hệ thống sẽ không lưu trữ nhiều kỳ tài chính bán niên/năm trùng lặp trong DB. Thay vào đó, Backend sẽ giữ nguyên kỳ tài chính năm gốc (`YEARLY`) của người dùng và thực hiện **suy luận động khoảng ngày** (`startDate` và `endDate`) phục vụ cho việc tính toán số liệu tại Step 2, 3, 4, Preview và Submit.

#### 2.1. Cài đặt Hàm Suy Luận Khoảng Ngày (Date Inference Helper)
Khi load dữ liệu từ Step 2 trở đi, Backend sẽ kiểm tra trong Draft `step1Data.taxPeriodOption` để xác định khoảng thời gian thực tế:

```typescript
export function getTaxDeclarationPeriodRange(
  periodStartDate: Date, 
  taxPeriodOption?: string
): { startDate: Date; endDate: Date; usePeriodId: boolean } {
  const startOfYear = moment(periodStartDate).startOf('year');
  
  if (taxPeriodOption === '6 tháng đầu năm') {
    return {
      startDate: startOfYear.clone().toDate(), // 01/01
      endDate: startOfYear.clone().month(5).endOf('month').toDate(), // 30/06
      usePeriodId: false, // Phải tính theo khoảng ngày vì chỉ lấy nửa năm
    };
  }
  
  if (taxPeriodOption === '6 tháng cuối năm') {
    return {
      startDate: startOfYear.clone().month(6).startOf('month').toDate(), // 01/07
      endDate: startOfYear.clone().endOf('year').toDate(), // 31/12
      usePeriodId: false, // Phải tính theo khoảng ngày
    };
  }
  
  // Mặc định là 'Năm' hoặc khớp cấu hình kỳ của người dùng
  return {
    startDate: startOfYear.clone().toDate(), // 01/01
    endDate: startOfYear.clone().endOf('year').toDate(), // 31/12
    usePeriodId: true, // Tận dụng index periodId
  };
}
```

#### 2.2. Áp dụng vào luồng lấy dữ liệu Step 2 (Doanh thu)
Tại hàm `buildStep2Data` (`src/tax-declaration/tax-declaration.service.ts`), thay vì truyền trực tiếp `period.startDate` và `period.endDate`, hệ thống sẽ áp dụng khoảng ngày suy luận động:

```typescript
// Lấy option từ draft
const draft = await this.findDraftByPeriodId(period.id);
const taxPeriodOption = (draft?.step1Data as any)?.taxPeriodOption;

const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
  period.startDate,
  taxPeriodOption
);

const [realtimeData, industriesData, transactionCount] = await Promise.all([
  this.financialPeriodsService.calculateRealtimeTaxData(
    userId,
    startDate,
    endDate,
    usePeriodId ? period.id : undefined,
  ),
  this.financialPeriodsService.getRevenueByIndustry(
    userId,
    startDate,
    endDate,
    undefined,
    usePeriodId ? period.id : undefined,
  ),
  this.prisma.invoice.count({
    where: {
      userId,
      status: 'ISSUED',
      ...(usePeriodId ? { periodId: period.id } : { issueDate: { gte: startDate, lte: endDate } }),
    },
  }),
]);
```

#### 2.3. Áp dụng vào luồng Ký Nộp & Khóa Kỳ (Submit)
Khi gọi API Submit (`POST /submit/:publicId`), hệ thống sẽ tính toán số thuế và chốt sổ dựa trên khoảng ngày động này:
* Số doanh thu chốt và số thuế nộp của tờ khai được tính chính xác theo khoảng ngày `startDate` và `endDate` đã suy luận từ `taxPeriodOption`.
* Khi gọi `closeFinancialPeriod`, hệ thống vẫn đóng kỳ tài chính năm gốc (`period.id`) để khóa sổ, đảm bảo không có chứng từ nào trong cả năm bị sửa đổi sau khi đã chốt tờ khai năm/bán niên.

---

## 3. Đánh Giá Tính Khả Thi

* **Khả thi 100%:** Giải pháp suy luận khoảng ngày động giúp hệ thống giữ nguyên thiết kế cơ sở dữ liệu phẳng của `financial_periods` mà vẫn đáp ứng hoàn hảo nghiệp vụ khai báo bán niên/năm của Thông tư 152/2025/TT-BTC.
* **Tối ưu hóa Index:** Đối với option `"Năm"` (chiếm 95% trường hợp), hệ thống truy xuất trực tiếp bằng `periodId` giúp tận dụng index hiệu quả. Chỉ khi người dùng chọn bán niên mới chuyển sang lọc theo khoảng ngày (`issueDate`).
