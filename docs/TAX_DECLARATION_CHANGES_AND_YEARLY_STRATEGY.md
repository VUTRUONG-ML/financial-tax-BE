# 📑 Bổ Sung & Cập Nhật Nghiệp Vụ Kê Khai Thuế & Kỳ Tài Chính (So với TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md)

Tài liệu này ghi nhận các thay đổi, bổ sung nghiệp vụ và cấu trúc kỹ thuật mới liên quan đến **Kỳ tài chính** và **Kê khai thuế** đã được áp dụng trong mã nguồn, bổ sung cho tài liệu tích hợp gốc [TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md](file:///E:/financial-tax-system_BE/docs/TAX_DECLARATION_AND_PERIODS_INTEGRATION_GUIDE.md).

---

## 1. Hỗ Trợ Kỳ Tài Chính Năm (`YEARLY`) cho Hộ Kinh Doanh Nhóm 1

### Cập nhật so với Mục 1 (Module Kỳ Tài Chính)
Hệ thống bổ sung cấu trúc chu kỳ năm và bán niên:
* **Khởi tạo tự động**: Hộ kinh doanh Nhóm 1 (Doanh thu $\le$ 1 tỷ đồng/năm) được gán `vatFilingPeriod = YEARLY` ngay khi onboarding. Kỳ tài chính của họ bắt đầu từ **01/01** đến **31/12** của năm đó.
* **Thời hạn nộp thuế (Deadline)**: Hạn nộp tờ khai và thuế của kỳ `YEARLY` được tính toán tự động là ngày **31/03 của năm dương lịch tiếp theo** (thay vì tính theo tháng hoặc quý).
* **Mở/Khóa kỳ từng phần**: 
  - Khi Hộ kinh doanh nộp tờ khai **"6 tháng đầu năm"**, kỳ tài chính năm gốc vẫn ở trạng thái **`OPEN`** để tiếp tục ghi nhận hóa đơn/chứng từ cho nửa cuối năm.
  - Kỳ tài chính chỉ chuyển sang trạng thái **`CLOSED`** khi người dùng nộp tờ khai **"Năm"** (Quyết toán toàn bộ năm).

---

## 2. Máy Trạng Thế Sinh Tùy Chọn Kỳ Thuế Động (Step 1)

### Cập nhật so với Mục 2.3 (Chi Tiết Kỹ Thuật Bước 1)
Danh sách tùy chọn kỳ thuế (`availablePeriodOptions`) và kỳ chọn mặc định (`taxPeriodOption`) tại Bước 1 được sinh tự động dựa trên thời gian thực tế và lịch sử nộp tờ khai:

| Thời điểm lập tờ khai | Trạng thái nộp bán niên 1 | `availablePeriodOptions` (Tùy chọn hiển thị) | `taxPeriodOption` (Mặc định) |
| :--- | :--- | :--- | :--- |
| **Trước ngày 01/07** | *Chưa xét* | `["6 tháng đầu năm [Năm]"]` | `6 tháng đầu năm [Năm]` |
| **Từ ngày 01/07 trở đi** | **ĐÃ nộp** tờ bán niên 1 | `["6 tháng cuối năm [Năm]", "Năm [Năm]"]` | `6 tháng cuối năm [Năm]` |
| **Từ ngày 01/07 trở đi** | **CHƯA nộp** tờ bán niên 1 | `["Năm [Năm]"]` | `Năm [Năm]` (Bắt buộc gộp) |

*(Ví dụ: Với năm tài chính 2026, các giá trị hiển thị sẽ là `"6 tháng đầu năm 2026"`, `"6 tháng cuối năm 2026"`, `"Năm 2026"`).*

---

## 3. Cơ Chế Khóa Cục Bộ (Local Locking)

### Cập nhật so với Mục 1.2 (Cơ Chế Khóa Kỳ Kế Toán)
Bên cạnh việc khóa cứng toàn bộ kỳ khi chuyển sang `CLOSED`, hệ thống bổ sung **Khóa cục bộ** đối với kỳ `YEARLY` đang `OPEN`:
* **Điều kiện kích hoạt**: Khi tồn tại một bản ghi tờ khai chính thức (`TaxDeclaration`) đã nộp có chứa cụm từ khóa `"6 tháng đầu năm"` trong XML.
* **Quy tắc khóa**: Chặn đứng tất cả hành vi Thêm mới (`POST`), Sửa (`PATCH`), Xóa (`DELETE`) các chứng từ, hóa đơn phát sinh trong khoảng thời gian từ **01/01 đến hết ngày 30/06** của năm tài chính đó.
* **Phản hồi lỗi**: Trả về mã lỗi `400 Bad Request` kèm thông báo:
  ```json
  {
    "statusCode": 400,
    "message": "Transactions on or before June 30 are locked because the first half tax declaration has been submitted."
  }
  ```

---

## 4. Tách Biệt Luồng Xử Lý Step 1 (Refactoring)

### Cập nhật cấu trúc Backend
Để mã nguồn rõ ràng, dễ bảo trì và không bị lồng chéo logic giữa các nhóm hộ kinh doanh, luồng API Step 1 đã được phân tách hoàn chỉnh:

```
getStep1 / saveStep1 (Router điều hướng)
 ├── Hộ kinh doanh Nhóm 1 (Tờ khai 01/TKN-CNKD)
 │    └── getStep1ForGroup1 / saveStep1ForGroup1
 └── Hộ kinh doanh Nhóm 2, 3, 4 (Tờ khai 01/CNKD & 02/QTT)
      └── getStep1ForGroupGreater1 / saveStep1ForGroupGreater1
```

* **Ưu điểm**: Frontend vẫn gọi chung các endpoint `/tax-declaration/step-1/:publicId` và `/tax-declaration/step-1/save/:publicId`, Backend tự động phân tích và xử lý riêng biệt mà không làm tăng độ phức tạp ở phía Client.

---

## 5. Hỗ Trợ Đầy Đủ Cho Kỳ Tháng / Quý & Phân Biệt Tờ Khai 01/CNKD và 02/QTT

Hệ thống phân biệt rõ ràng tùy chọn chu kỳ và ngày tính toán thực tế cho hai loại tờ khai đối với Hộ kinh doanh nhóm > 1 tỷ:

### 5.1. Tờ khai thuế định kỳ (Mẫu số 01/CNKD)
* **Tùy chọn thời gian hiển thị (`availablePeriodOptions`)**: Lấy theo đúng mốc kỳ kê khai gốc của họ (ví dụ: `Quý 2/2026` hoặc `Tháng 05/2026`).
* **Khoảng ngày áp dụng (`calculatedRange`)**: Giới hạn trong đúng mốc ngày bắt đầu và kết thúc của chu kỳ đó (ví dụ: `01/04/2026` đến `30/06/2026`).
* **Sử dụng mã định danh kỳ (`usePeriodId = true`)**: Để các dịch vụ snapshot và tính toán dữ liệu của Backend truy vấn trực tiếp bằng ID kỳ, nâng cao hiệu năng và tính nhất quán dữ liệu.

### 5.2. Tờ khai quyết toán thuế TNCN cuối năm (Mẫu số 02/CNKD-TNCN-QTT)
* **Tùy chọn thời gian hiển thị (`availablePeriodOptions`)**: Luôn hiển thị theo mốc **năm dương lịch** (ví dụ: `Năm 2026`).
* **Khoảng ngày áp dụng (`calculatedRange`)**: Luôn co giãn rộng ra toàn bộ năm dương lịch kế toán từ ngày **01/01 đến hết ngày 31/12** để tổng hợp đầy đủ số liệu kinh doanh.
* **Không sử dụng mã định danh kỳ đơn lẻ (`usePeriodId = false`)**: Đảm bảo tất cả các phép tính (Doanh thu ở Step 2, Tồn kho ở Step 3, Chi phí ở Step 4 và xem trước ở Step 5) sẽ quét toàn bộ dữ liệu giao dịch phát sinh của cả năm đó thay vì chỉ quét riêng kỳ gốc hiện tại.
