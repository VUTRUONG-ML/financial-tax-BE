# 📋 Điều Chỉnh Thiết Kế: Luôn Cho Phép Tùy Chọn Kê Khai "Cả Năm" Ở Nửa Cuối Năm
**Ngày lập:** 2026-06-30  
**Tác giả:** Antigravity (AI Pair Programmer)  
**Nội dung:** Điều chỉnh kịch bản sinh tùy chọn kỳ tính thuế (`taxPeriodOption`) của tờ khai `01_TKN_CNKD` để đảm bảo người dùng luôn có quyền lựa chọn kê khai "Năm" khi đã bước sang nửa cuối năm, ngay cả khi họ đã nộp tờ bán niên 1 trước đó.

---

## 1. Nghiệp Vụ Cập Nhật

Theo nguyện vọng thực tế của người dùng:
* Khi đã bước sang nửa cuối năm (`now >= 01/07`), tùy chọn **"Năm" (Cả năm)** phải luôn khả dụng để người dùng có thể thực hiện quyết toán toàn bộ năm tài chính nếu muốn.
* Nếu người dùng chọn **"Năm"** sau khi đã nộp tờ khai **"6 tháng đầu năm"**:
  - Số liệu quyết toán cả năm vẫn quét từ `01/01` đến `31/12`.
  - Số thuế còn phải nộp cuối năm sẽ tự động trừ đi số thuế đã nộp ở tờ khai "6 tháng đầu năm" đã lưu trong DB.

---

## 2. Kịch Bản Sinh Tùy Chọn Kỳ Tính Thuế Mới (Updated Option Rules)

Tại API lấy dữ liệu Bước 1 (`GET /v1/tax-declaration/step-1/:publicId`), Backend sẽ điều chỉnh logic sinh tùy chọn như sau:

```typescript
const now = moment();
const currentYear = period.startDate.getFullYear();
const midYearThreshold = moment(`${currentYear}-07-01`).startOf('day');

let availablePeriodOptions: string[] = [];
let defaultPeriodOption = '';

// 1. Kiểm tra xem đã nộp tờ khai 6 tháng đầu năm cho kỳ này chưa
const hasSubmittedFirstHalf = await this.prisma.taxDeclaration.count({
  where: {
    periodId: period.id,
    xmlContent: { contains: `<key>6_MONTHS_FIRST</key>` } // Cờ nhận dạng tờ khai bán niên 1
  }
}) > 0;

if (now.isBefore(midYearThreshold)) {
  // ── TRƯỜNG HỢP 1: Đang trong nửa đầu năm (now <= 30/06) ──
  // Chưa thể quyết toán năm hay bán niên 2. Chỉ có duy nhất tùy chọn bán niên 1.
  availablePeriodOptions = ['6 tháng đầu năm'];
  defaultPeriodOption = '6 tháng đầu năm';
} else {
  // ── TRƯỜNG HỢP 2: Đang trong nửa cuối năm (now >= 01/07) ──
  if (hasSubmittedFirstHalf) {
    // Nếu ĐÃ nộp 6 tháng đầu năm trước đó:
    // Cho phép chọn "6 tháng cuối năm" để hoàn thành kỳ phụ, hoặc chọn "Năm" để làm quyết toán gộp cả năm.
    availablePeriodOptions = ['6 tháng cuối năm', 'Năm'];
    defaultPeriodOption = '6 tháng cuối năm'; // Gợi ý tiếp tục kỳ phụ bán niên 2
  } else {
    // Nếu CHƯA nộp 6 tháng đầu năm trước đó:
    // Bắt buộc phải chọn gộp "Năm". Không cho phép chọn lẻ "6 tháng cuối năm" khi thiếu đầu năm.
    availablePeriodOptions = ['Năm'];
    defaultPeriodOption = 'Năm';
  }
}
```

---

## 3. Điều Chỉnh Logic Validate Khi Lưu Step 1 (`saveStep1`)

Backend sẽ thực hiện kiểm tra chéo (Cross-Validation) các tham số gửi từ Client:
* Nếu `now.isBefore(midYearThreshold)` và gửi `taxPeriodOption = 'Năm'` hoặc `'6 tháng cuối năm'` -> Ném lỗi `400 Bad Request`.
* Nếu chưa nộp tờ khai 6 tháng đầu năm và gửi `taxPeriodOption = '6 tháng cuối năm'` -> Ném lỗi `400 Bad Request` với lý do: `"Kỳ 6 tháng đầu năm chưa được kê khai, bạn chỉ được phép chọn tùy chọn quyết toán gộp 'Năm'."`
* Các trường hợp còn lại đều được chấp nhận hợp lệ.
