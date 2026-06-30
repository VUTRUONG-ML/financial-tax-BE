# 📋 Phân Tích & Giải Pháp Đơn Giản Hóa: Luồng Chốt Kỳ Bán Niên & Không Nhân Bản Kỳ Tài Chính
**Ngày lập:** 2026-06-30  
**Tác giả:** Antigravity (AI Pair Programmer)  
**Mục tiêu:** Giải quyết mối lo ngại về việc phải tạo thêm kỳ mới và gán lại hóa đơn khi chốt tờ khai bán niên (6 tháng đầu/cuối năm). Đề xuất phương án tối giản hóa hệ thống không cần tạo kỳ mới.

---

## 1. Bản Chất Khó Khăn & Phân Tích Sự Phức Tạp
Nếu chốt tờ bán niên 1 mà phải sinh ra một kỳ tài chính mới trong database (ví dụ kỳ 6 tháng đầu năm):
1. **Ràng buộc Hóa đơn:** Phải tìm toàn bộ các hóa đơn đã phát hành trong 6 tháng đó để cập nhật lại `periodId` trỏ từ kỳ năm sang kỳ bán niên mới.
2. **Xung đột khi tạo chứng từ mới:** Các hóa đơn mới tạo sau này rơi vào 6 tháng đầu năm sẽ phải phân luồng phức tạp để gán đúng kỳ bán niên thay vì kỳ năm.
3. **Phá vỡ cấu trúc kế toán:** Việc chia nhỏ kỳ năm gốc thành các kỳ bán niên vụn vặt làm mất đi tính nhất quán của kỳ tính thuế năm dương lịch (`YEARLY`).

---

## 2. Giải Pháp Đơn Giản Hóa: Chốt Kỳ Năm Gốc & Không Nhân Bản Kỳ Tài Chính

Để loại bỏ hoàn toàn sự phức tạp trên, chúng ta **không tạo thêm bất kỳ kỳ tài chính bán niên nào trong DB**. Hệ thống sẽ vận hành theo thiết kế tối giản sau:

### 2.1. Giữ nguyên Kỳ tài chính năm gốc (`YEARLY`) làm trục khóa sổ duy nhất
* Hộ kinh doanh thuộc Nhóm 1 có kỳ tài chính duy nhất trong năm là kỳ năm dương lịch (ví dụ: `startDate = 01/01/2026`, `endDate = 31/12/2026`, `status = OPEN`).
* Tất cả hóa đơn phát sinh trong năm 2026 đều được gán chung vào `periodId` của kỳ năm này.

### 2.2. Cơ chế chốt sổ khi người dùng nộp tờ khai bán niên
Khi người dùng bấm **"Ký nộp"** tờ khai tại Step 5:

#### 1. Trường hợp chọn `"Năm"` hoặc `"6 tháng cuối năm"` (Kỳ cuối năm):
* Hệ thống tiến hành đóng kỳ năm gốc: chuyển trạng thái kỳ năm gốc sang `CLOSED` (Khóa toàn bộ năm 2026).
* Sinh tờ khai `TaxDeclaration` chính thức liên kết với kỳ năm gốc này.

#### 2. Trường hợp chọn `"6 tháng đầu năm"` (Kỳ bán niên 1):
* Hệ thống **vẫn giữ kỳ năm gốc ở trạng thái `OPEN`** (Đang mở - không chuyển kỳ năm sang `CLOSED`).
* **Lý do:** Người dùng vẫn cần tạo hóa đơn/phiếu chi cho nửa cuối năm (từ 01/07 đến 31/12).
* **Cơ chế khóa sổ cục bộ (Lock 6 tháng đầu năm):**
  - Để ngăn người dùng sửa hóa đơn/chứng từ của 6 tháng đầu năm sau khi đã nộp tờ khai bán niên 1, hệ thống không dùng `PeriodLockGuard` thông thường.
  - Thay vào đó, Backend bổ sung một điều kiện kiểm tra trong `PeriodLockGuard` hoặc `getOrCreateAndValidatePeriod`: **Nếu kỳ tài chính năm đó đã có tờ khai bán niên 1 đã nộp (`status = SUCCESS` cho `01_TKN_CNKD` của 6 tháng đầu năm), hệ thống sẽ chặn mọi hành vi write có ngày giao dịch nhỏ hơn hoặc bằng ngày `30/06`**.
  - Giải pháp này giúp khóa cứng dữ liệu 6 tháng đầu năm một cách an toàn mà không cần tạo kỳ mới hay thay đổi `periodId` của hóa đơn.

```typescript
// Trong logic validate hoặc ensurePeriodExists của invoices/vouchers:
const startOfYear = moment(issueDate).startOf('year');
const endOfFirstHalf = startOfYear.clone().month(5).endOf('month').toDate(); // 30-06

if (issueDate <= endOfFirstHalf) {
  // Kiểm tra xem đã nộp tờ khai 6 tháng đầu năm chưa
  const hasSubmittedFirstHalf = await this.prisma.taxDeclaration.count({
    where: {
      period: { userId },
      periodId: period.id,
      xmlContent: { contains: `"6 tháng đầu năm"` } // Hoặc cột đánh dấu kỳ phụ
    }
  }) > 0;

  if (hasSubmittedFirstHalf) {
    throw new BadRequestException("Dữ liệu 6 tháng đầu năm đã được khóa sau khi nộp tờ khai bán niên.");
  }
}
```

---

## 3. Lợi Ích Của Giải Pháp Đơn Giản Hóa
* **Không tốn chi phí phát triển & vận hành:** Không cần viết logic migration để gán lại `periodId` cho hàng ngàn hóa đơn cũ.
* **Tận dụng 100% cấu trúc hiện tại:** Mọi nghiệp vụ chốt sổ, tính toán YTD và sinh XML tờ khai hoạt động bình thường dựa trên khoảng ngày co giãn động.
* **Bảo vệ toàn vẹn dữ liệu:** Vẫn đảm bảo khóa cứng dữ liệu đã nộp thuế đúng luật mà không làm xáo trộn luồng kế toán.
