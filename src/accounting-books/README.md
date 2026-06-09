# 📊 Accounting Books Module

Module này chịu trách nhiệm trích xuất và tính toán các **Sổ kế toán** (Accounting Books) theo quy định của pháp luật dành cho Hộ kinh doanh. Các sổ được kết xuất dựa trên dữ liệu giao dịch thực tế đã phát sinh (Hóa đơn, Phiếu thu/chi).

## 📁 Cấu trúc Sổ hỗ trợ

Tùy thuộc vào Nhóm thuế (`taxGroupId`), hệ thống sẽ tự động quyết định loại sổ phù hợp cho người dùng:
- **Nhóm 1:** Sổ `S1a-HKD` (Sổ chi tiết doanh thu).
- **Nhóm 2:** Sổ `S2a-HKD` (Sổ chi tiết doanh thu, chi phí, thuế TNCN) và Sổ `S2b-HKD` (Sổ chi tiết thuế GTGT).
- **Nhóm 3 & 4:** Sổ `S2b-HKD`.

---

## 🧠 Kiến trúc tính thuế phổ quát (Universal YTD Tax Architecture)

Một trong những thách thức lớn nhất của module này là việc cung cấp tính năng **xem sổ theo một khoảng thời gian bất kỳ (từ `startDate` đến `endDate`)**, nhưng vẫn phải đảm bảo tính toán chính xác số thuế phát sinh dựa trên:
1. **Ngưỡng miễn thuế 500 triệu/năm** (Dành cho phương pháp Tỷ lệ % trên doanh thu - PERCENTAGE).
2. **Quy tắc kết chuyển lỗ trong năm tài chính** (Dành cho phương pháp Lợi nhuận - PROFIT).

Thay vì viết các câu lệnh `if-else` phức tạp để xử lý rẽ nhánh cho từng phương pháp, hệ thống sử dụng một công thức chung duy nhất:

### Công thức Generic YTD (Year-To-Date)

> **Thuế_Phát_Sinh_Trong_Kỳ = Thuế_Lũy_Kế(Đến `endDate`) - Thuế_Lũy_Kế(Đến trước `startDate`)**

Các bước thực hiện trong code:
1. Query tính tổng Doanh thu ($R_1$) và Chi phí ($E_1$) từ đầu năm (01/01) đến trước `startDate`.
2. Query tính tổng Doanh thu ($R_2$) và Chi phí ($E_2$) phát sinh trong khoảng `[startDate, endDate]`.
3. Đưa hai mốc lũy kế này qua `TaxEngineService` để lấy ra tổng tiền thuế.
4. Thuế phát sinh = `Tax(R1 + R2, E1 + E2) - Tax(R1, E1)`.

### 💡 Chứng minh tính đúng đắn về mặt Toán học & Luật Thuế

#### Trường hợp 1: Phương pháp tỷ lệ % (PERCENTAGE)
Nếu hộ kinh doanh chưa đạt mốc 500 triệu trước `startDate` nhưng vượt mốc trong kỳ, công thức này đảm bảo phần doanh thu vượt mốc sẽ bị đánh thuế chính xác, còn phần dưới 500 triệu tiếp tục được miễn.

#### Trường hợp 2: Phương pháp Lợi nhuận (PROFIT)
Gọi thuế suất là $r$.

**Kịch bản A (Luôn có lãi):**
- Thuế lũy kế trước kỳ = $(R_1 - E_1) \times r$
- Thuế lũy kế đến cuối kỳ = $((R_1 + R_2) - (E_1 + E_2)) \times r$
- Phép trừ hai mốc lũy kế:
  `[((R1 + R2) - (E1 + E2)) - (R1 - E1)] * r` = **$(R_2 - E_2) \times r$**
  *(Triệt tiêu hoàn toàn phần lũy kế cũ, trả về đúng bằng Lợi nhuận trong kỳ nhân thuế suất).*

**Kịch bản B (Bù trừ lỗ trong năm - Loss Carry-forward):**
Nếu trước `startDate` hộ kinh doanh bị **lỗ** ($E_1 > R_1$), tiền thuế đóng bằng 0.
Trong kỳ `[startDate, endDate]` có lãi ($R_2 > E_2$).
- Tổng lợi nhuận lũy kế lúc này là: $(R_1 + R_2) - (E_1 + E_2)$.
- Hệ thống sẽ tự động lấy khoản lãi mới này **bù trừ cho khoản lỗ cũ** rồi mới nhân thuế suất.
- Kết quả trả về sẽ nhỏ hơn so với việc tính lẻ lợi nhuận của riêng kỳ đó, **hoàn toàn chính xác với chính sách kết chuyển lỗ trong cùng năm tài chính của Cơ quan Thuế**.

---

## 🔒 Bảo mật và Hiệu suất
- Mọi câu truy vấn Database (`aggregate`) đều được thiết lập điều kiện chặt chẽ theo `userId` (Owner) để phòng chống IDOR.
- Sử dụng Promise.all() cho các câu query độc lập (VD: Tính YTD trước kỳ cho cả Revenue và Expense) nhằm tối ưu hóa thời gian phản hồi API.

---

## 🚀 Tách API & Cơ chế Đồng bộ hóa (Sync Code)

Để tối ưu hóa hiệu năng trải nghiệm người dùng, hệ thống đã tách việc lấy dữ liệu sổ sách ra làm 2 luồng riêng biệt:

1. **API Phân trang (Records)**: Nhanh gọn, trả về ngay danh sách hóa đơn theo trang.
2. **API Tổng hợp (Summary)**: Thực hiện các truy vấn aggregation nặng để tính toán ra được các sổ thuế YTD phức tạp ở phía trên. Không trả về mảng chi tiết (rows).

### Cơ chế Sync Code (Flag phát hiện thay đổi)
Do dữ liệu tổng hợp (summary) rất nặng, chúng ta không gọi API này lại sau mỗi lần người dùng bấm qua trang mới ở giao diện phân trang. Thay vào đó:

- Backend sinh ra một mã `syncCode` mỗi khi truy vấn. Mã này được tạo ra cực kỳ nhanh thông qua việc lấy tổng số lượng (count) và mốc thời gian cập nhật mới nhất (max updatedAt) của bảng `Invoice` và `Voucher` trong khoảng thời gian đang tra cứu.
  *Ví dụ Hash:* `[invCount]-[invMaxTime]-[vchCount]-[vchMaxTime]`
- Khi Frontend gọi API Records (phân trang), nó gửi kèm `syncCode` hiện tại.
- Backend so sánh mã cũ và mã mới. Nếu dữ liệu có thay đổi (có hóa đơn mới xuất, phiếu chi mới,...), Backend sẽ gán cờ `isSummaryOutdated: true`.
- Giao diện (Frontend) dựa vào cờ này để chủ động gọi lại API Summary một lần duy nhất nhằm cập nhật lại số liệu thuế mà không cần load lại toàn trang.
