# 🎨 Hướng Dẫn Tích Hợp Kê Khai Thuế Cho Frontend (FE Tax Declaration Integration Guide)

Tài liệu này hướng dẫn chi tiết cho các lập trình viên Frontend (FE) cách tích hợp giao diện Wizard Kê khai thuế 5 bước với hệ thống Backend (BE).

---

## 1. Bản Đồ Tổng Quan Của Wizard Kê Khai Thuế

FE cần thiết lập một luồng giao diện Wizard động gồm tối đa 5 bước, trong đó số lượng bước khả dụng và thứ tự hiển thị phụ thuộc hoàn toàn vào loại tờ khai (`declarationFormType`) được chọn ở bước khởi tạo:

| Loại Tờ Khai | Số Bước Khả Dụng | Các Bước Cần Thực Hiện |
| :--- | :---: | :--- |
| **`01_TKN_CNKD`** (Tờ khai khoán $\le$ 1 tỷ) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4) |
| **`01_CNKD`** (Kê khai định kỳ) | **3 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 5 (Ẩn Step 3, 4) |
| **`02_CNKD_TNCN_QTT`** (Quyết toán TNCN năm) | **5 bước** | Step 1 $\rightarrow$ Step 2 $\rightarrow$ Step 3 $\rightarrow$ Step 4 $\rightarrow$ Step 5 |

> [!WARNING]
> Nếu người dùng đang làm tờ khai `01_TKN_CNKD` hoặc `01_CNKD` mà FE gửi API của Step 3 hoặc Step 4, Backend sẽ chặn lại và trả về mã lỗi `400 Bad Request` với `errorCode: "STEP_NOT_APPLICABLE"`. FE cần ẩn hoàn toàn 2 bước này trên thanh tiến trình UI (Progress Bar) của luồng 3 bước.

---

## 2. Chi Tiết Từng Bước Tích Hợp (FE Integration Details)

### 2.1. Bước 1: Khai Báo Thông Tin Hành Chính & Tùy Chọn Kỳ
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-1/:publicId`
* **Cấu Trúc Dữ Liệu Trả Về (Nested DTO)**:
  Dữ liệu trả về được chia làm 4 nhóm riêng biệt giúp FE hiển thị rõ ràng trên form:
  1. `financialPeriodInfo`: Chứa khoảng ngày co giãn thực tế (`calculatedRange`). FE dùng để hiển thị thời gian dữ liệu áp dụng cho tờ khai này.
  2. `taxpayerProfile`: Thông tin của Hộ kinh doanh (MST, tên doanh nghiệp, địa chỉ, ngành nghề...).
  3. `declarationOptions`:
     * `declarationFormType`: Loại tờ khai đang lập (`01_TKN_CNKD` | `01_CNKD` | `02_CNKD_TNCN_QTT`).
     * `availablePeriodOptions`: **Mảng các chu kỳ có sẵn để FE hiển thị Dropdown**.
     * `taxPeriodOption`: Giá trị kỳ đang chọn/kỳ mặc định (ví dụ: `6 tháng đầu năm 2026`, `Quý 2/2026`, hoặc `Năm 2026`).
  4. `authorizedAgentInfo`: Các trường thông tin phục vụ đại lý thuế hoặc ủy quyền khai thay.

* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-1/save/:publicId`
* **Request Body (Flat DTO)**:
  FE gửi dữ liệu dưới dạng cấu trúc phẳng (Flat JSON) để thuận tiện cho việc submit form:
  ```json
  {
    "taxCode": "0102030405",
    "businessName": "Hộ kinh doanh Nguyễn Văn A",
    "ownerName": "Nguyễn Văn A",
    "cccdNumber": "001095001234",
    "provinceCity": "Hà Nội",
    "taxpayerOption": "Hộ kinh doanh, cá nhân kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống",
    "taxPeriodOption": "6 tháng đầu năm 2026",
    "declarationTypeOption": "Tờ khai lần đầu",
    "authorizedFilerName": "",
    "authorizedFilerTaxCode": "",
    "authorizedFilerDocNumber": "",
    "authorizedFilerDocDate": null,
    "taxAgentName": "",
    "taxAgentTaxCode": ""
  }
  ```

---

### 2.2. Bước 2: Xác Nhận Doanh Thu Chịu Thuế
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-2/:publicId`
  Hiển thị danh sách ngành nghề và doanh thu tương ứng trong kỳ kế khai.
* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-2/save/:publicId`
  * **Lưu ý quan trọng**: API này **không yêu cầu truyền Request Body**. Khi FE gọi API này, Backend sẽ tự động lấy dữ liệu realtime từ hệ thống hóa đơn để chụp lại mốc dữ liệu (Snapshot) doanh thu tại thời điểm đó và lưu vào bản nháp.

---

### 2.3. Bước 3: Xác Nhận Tồn Kho (Chỉ áp dụng cho Quyết toán năm `02_QTT`)
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-3/:publicId`
  Trả về bảng số liệu tồn kho tổng hợp gồm: Giá trị đầu kỳ (`openingValue`), Nhập trong kỳ (`importedValue`), Xuất trong kỳ (`exportedValue`) và Cuối kỳ (`closingValue`).
* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-3/save/:publicId`
  * **Lưu ý**: Tương tự Step 2, API này **không yêu cầu Request Body**. Backend tự động snapshot giá trị kho hiện tại.

---

### 2.4. Bước 4: Xác Nhận Chi Phí Hợp Lệ (Chỉ áp dụng cho Quyết toán năm `02_QTT`)
* **Endpoint Lấy Dữ Liệu**: `GET /tax-declaration/step-4/:publicId`
  Trả về chi tiết các nhóm chi phí theo Thông tư 152/2025/TT-BTC.
* **Endpoint Lưu Dữ Liệu**: `POST /tax-declaration/step-4/save/:publicId`
  * **Lưu ý**: API này **không yêu cầu Request Body**. Backend tự động snapshot các chứng từ chi phí và giá vốn.

---

### 2.5. Bước 5: Xem Trước & Ký Nộp
* **Endpoint Xem Trước**: `GET /tax-declaration/step-5/preview/:publicId`
  FE dùng dữ liệu này để hiển thị trang tổng quan trước khi nộp:
  * `pitComparison`: Đối chiếu số thuế TNCN phải nộp giữa 2 phương pháp (Lợi nhuận vs Tỷ lệ Doanh thu).
  * `ytdRevenue` & `ytdExpense`: Doanh thu & chi phí lũy kế từ đầu năm.
  * `operatedIndustries`: Danh sách chi tiết ngành nghề hoạt động kèm hạn mức giảm trừ doanh thu YTD (`ytdExemption`).

* **Endpoint Nộp Tờ Khai Chính Thức**:
  Hệ thống sử dụng luồng nộp tờ khai kèm xử lý biến động số liệu:
  
  ```
  [FE gọi submit] ──> BE kiểm tra lệch số liệu DB vs Draft
                     ├── Khớp: Lưu tờ khai thành công.
                     └── Lệch (409 Conflict): Trả về mã lỗi "DATA_CHANGED".
                          └── FE hiển thị Popup cảnh báo lệch số liệu.
                               ├── Chọn "Cập nhật & Nộp": Gọi submit-force
                               └── Chọn "Giữ số cũ & Nộp": Gọi submit-ignore-warning
  ```

#### Các API phục vụ Ký nộp (Yêu cầu `multipart/form-data`):
1. **Nộp thông thường**: `POST /tax-declaration/submit/:publicId`
2. **Nộp đè (Đồng bộ số liệu mới)**: `POST /tax-declaration/submit-force/:publicId`
3. **Nộp bỏ qua cảnh báo (Giữ nguyên số liệu cũ)**: `POST /tax-declaration/submit-ignore-warning/:publicId`

#### Request Payload gửi lên dưới dạng Multipart Form-Data:
* `xmlContent` (Text/String): Chuỗi XML tờ khai hoàn chỉnh do FE biên dựng.
* `chosenPitMethod` (String): Phương pháp tính thuế TNCN được chọn (`PERCENTAGE` | `PROFIT_15` | `PROFIT_17` | `PROFIT_20`).
* `file` (File Binary - Optional): File PDF kết xuất của tờ khai để lưu trữ.

---

## 3. Cách Xử Lý Lỗi Và Trạng Thái Đặc Biệt

1. **Lệch Số Liệu (409 Conflict)**:
   Khi nhận được phản hồi lỗi `409 DATA_CHANGED`, Backend sẽ gửi kèm số liệu nháp (`draftData`) và số liệu thực tế hiện tại (`realTimeData`). FE cần render một bảng so sánh trực quan trên Popup để người dùng hiểu vì sao có sự chênh lệch trước khi quyết định chọn nộp đè hoặc giữ số cũ.
2. **Lỗi Bước Không Khả Dụng (400 Bad Request - STEP_NOT_APPLICABLE)**:
   Xảy ra khi cố truy cập Step 3, 4 ở tờ khai 3 bước. FE nên điều hướng người dùng quay lại Step 2 hoặc nhảy trực tiếp sang Step 5.
3. **Khóa Cục Bộ (400 Bad Request - TRANSACTIONS_LOCKED)**:
   Nếu người dùng cố gắng thêm/sửa/xóa hóa đơn có ngày phát sinh $\le$ `30/06` sau khi đã nộp tờ khai bán niên 1, API của hóa đơn/chứng từ đó sẽ trả về lỗi này. FE cần hiển thị thông báo yêu cầu người dùng mở lại tờ khai bán niên hoặc chỉ chỉnh sửa các giao dịch phát sinh từ ngày `01/07` trở đi.
