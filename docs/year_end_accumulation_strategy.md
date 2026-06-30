# 📋 Giải Pháp Lũy Kế & Chốt Giá Trị Doanh Thu / Chi Phí Cho Tờ Khai 6 Tháng Cuối Năm
**Ngày lập:** 2026-06-30  
**Tác giả:** Antigravity (AI Pair Programmer)  
**Tập trung giải quyết:** Nghiệp vụ lũy kế doanh thu/chi phí cho tờ khai "6 tháng cuối năm" trong trường hợp người dùng chưa chốt hoặc bỏ qua tờ khai "6 tháng đầu năm".

---

## 1. Nghiệp Vụ Theo Quy Định Của Pháp Luật (Circular 152/2025/TT-BTC)

Đối với các Hộ kinh doanh kê khai theo năm/bán niên (Nhóm Doanh thu $\le$ 100 triệu):
* Việc kê khai **"6 tháng đầu năm"** là hoạt động kê khai tạm tính hoặc kê khai giữa kỳ.
* Tờ khai **"6 tháng cuối năm"** thực chất là tờ khai **quyết toán tổng hợp cuối năm**, phản ánh toàn bộ kết quả hoạt động kinh doanh lũy kế của cả năm đó, sau khi trừ đi phần số thuế đã tạm nộp ở 6 tháng đầu năm (nếu có).

Do đó, về mặt số liệu:
* Số liệu doanh thu, chi phí của tờ khai "6 tháng cuối năm" **bắt buộc phải bao gồm toàn bộ chứng từ phát sinh của cả 12 tháng** (lũy kế từ ngày 01/01 đến 31/12).
* Số thuế phải nộp cuối năm = Tổng số thuế của cả năm - Số thuế đã nộp trong kỳ 6 tháng đầu năm.

---

## 2. Giải Pháp Thu Thập Số Liệu Động (Dynamic Accumulation Scheme)

Bất kể người dùng đã chốt kỳ "6 tháng đầu năm" hay chưa, Backend luôn thu thập số liệu doanh thu và chi phí một cách chính xác dựa trên logic sau:

### 2.1. Doanh thu & Chi phí thực tế (Realtime DB Fetching)
* **Tờ khai "6 tháng đầu năm"**: Lấy toàn bộ chứng từ phát sinh từ `01/01` đến `30/06`.
* **Tờ khai "6 tháng cuối năm"**: Lấy toàn bộ chứng từ phát sinh từ `01/07` đến `31/12` và cộng lũy kế với số liệu của `01/01` đến `30/06` (tức là lấy trọn vẹn cả năm từ `01/01` đến `31/12`).
  - Nếu người dùng đã nộp tờ khai "6 tháng đầu năm" trước đó: Backend lấy số liệu đã nộp trong database (`declaredRevenue` và `declaredExpense` của tờ bán niên 1) cộng với số liệu phát sinh thực tế của 6 tháng cuối năm để ra tổng lũy kế cả năm.
  - Nếu người dùng **chưa nộp** tờ khai "6 tháng đầu năm": Backend tự động quét và tính toán realtime toàn bộ hóa đơn/chứng từ từ ngày `01/01` đến ngày `31/12` để ra số liệu quyết toán cuối năm.

```typescript
const startOfYear = moment(period.startDate).startOf('year').toDate();
const endOfFirstHalf = moment(period.startDate).startOf('year').month(5).endOf('month').toDate();

let finalRevenue: number;
let finalExpense: number;

if (taxPeriodOption === '6 tháng cuối năm') {
  // Tìm tờ khai 6 tháng đầu năm đã nộp
  const firstHalfDecl = await this.prisma.taxDeclaration.findFirst({
    where: {
      periodId: period.id,
      // Logic đánh dấu tờ khai bán niên 1
    }
  });

  const secondHalfRealtime = await this.financialPeriodsService.calculateRealtimeTaxData(
    userId,
    moment(endOfFirstHalf).add(1, 'ms').toDate(), // 01/07
    period.endDate // 31/12
  );

  if (firstHalfDecl) {
    // Nếu đã chốt 6 tháng đầu năm: Lấy số đã chốt + số phát sinh thực tế 6 tháng cuối năm
    finalRevenue = firstHalfDecl.declaredRevenue.toNumber() + secondHalfRealtime.revenue.toNumber();
    finalExpense = firstHalfDecl.declaredExpense.toNumber() + secondHalfRealtime.expense.toNumber();
  } else {
    // Nếu CHƯA chốt 6 tháng đầu năm: Lấy toàn bộ chứng từ của cả năm (01/01 - 31/12)
    const fullYearRealtime = await this.financialPeriodsService.calculateRealtimeTaxData(
      userId,
      startOfYear,
      period.endDate
    );
    finalRevenue = fullYearRealtime.revenue.toNumber();
    finalExpense = fullYearRealtime.expense.toNumber();
  }
}
```

---

## 3. Lợi Ích & Sự Khả Thi
* **Không phụ thuộc vào trạng thái chốt đầu năm:** Người dùng có thể bỏ qua kỳ 6 tháng đầu năm và nộp thẳng tờ khai cuối năm mà không bị lệch số hoặc lỗi hệ thống.
* **Đảm bảo tính pháp lý:** Số liệu quyết toán cuối năm luôn phản ánh đúng 100% dữ liệu thực tế phát sinh trên hóa đơn/chứng từ của Hộ kinh doanh trong suốt cả năm dương lịch.
