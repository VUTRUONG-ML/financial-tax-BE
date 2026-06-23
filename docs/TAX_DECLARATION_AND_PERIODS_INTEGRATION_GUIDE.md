# Hướng Dẫn Tích Hợp & Nghiệp Vụ Kê Khai Thuế, Kỳ Tài Chính & Sổ Kế Toán (FE ↔ BE)

Tài liệu này cung cấp hướng dẫn tích hợp chi tiết cho Frontend (FE) về ba module core liên quan chặt chẽ: **Kỳ tài chính (Financial Periods)**, **Kê khai thuế (Tax Declaration)** và **Sổ sách kế toán (Accounting Books)**, làm rõ các logic nghiệp vụ quan trọng theo quy định mới, cơ chế đồng bộ `syncCode` và khóa kỳ kế toán.

---

## 1. Module Kỳ Tài Chính (Financial Periods)

Module Kỳ tài chính quản lý vòng đời kế toán của Hộ kinh doanh (HKD) theo từng tháng hoặc quý. Mỗi kỳ có 2 trạng thái chính: `OPEN` (Đang mở - cho phép sửa chứng từ) và `CLOSED` (Đã khóa sổ - chỉ đọc).

### 1.1. Bản Đồ API Kỳ Tài Chính

Các API chính thức phục vụ quản lý kỳ tài chính (yêu cầu Bearer Token):

| Chức năng | Method | Endpoint | Payload / Query | Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Lấy danh sách kỳ** | `GET` | `/financial-periods` | Query: `page`, `limit`, `status` | Trả về danh sách các kỳ kế khai của HKD kèm trạng thái và thời gian. |
| **Thống kê tổng quan** | `GET` | `/financial-periods/summary` | Không có | Lấy số lượng kỳ đang mở, kỳ quá hạn chưa nộp thuế, và tổng số tiền thuế đã nộp. |
| **So sánh thuế PIT** | `GET` | `/financial-periods/:id/compare-pit` | Tham số `:id` (publicId của kỳ) | Đối chiếu mức thuế PIT thu nhập cá nhân ở các cấu hình khác nhau. |
| **Mở lại kỳ kế toán** | `PATCH` | `/financial-periods/:id/reopen` | Tham số `:id` (publicId của kỳ) | Mở khóa kỳ kế toán đã đóng để cho phép chỉnh sửa lại chứng từ (Yêu cầu chưa nộp tiền thuế). |
| **Xác nhận nộp thuế** | `PATCH` | `/financial-periods/:id/confirm-payment` | Tham số `:id` (publicId), Body: Ngày nộp tiền | Ghi nhận HKD đã nộp thuế thành công (Chuyển trạng thái nộp thuế, chỉ Admin). |

### 1.2. Cơ Chế Khóa Kỳ Kế Toán (Period Lock / PeriodLockGuard)
* Khi một kỳ kế toán có trạng thái `status: 'CLOSED'`, hệ thống kích hoạt **`PeriodLockGuard`** để khóa cứng tất cả dữ liệu phát sinh trong kỳ đó.
* Các hành vi tạo mới (`POST`), cập nhật (`PATCH`), xóa (`DELETE`) trên các chứng từ (Hóa đơn bán ra, Phiếu nhập/xuất kho, Phiếu thu/chi) có ngày giao dịch nằm trong kỳ đã đóng sẽ bị chặn và trả về lỗi:
  ```json
  {
    "statusCode": 400,
    "message": "The financial period is closed.",
    "errorCode": "FINANCIAL_PERIOD_IS_CLOSED"
  }
  ```

---

## 2. Module Kê Khai Thuế (Tax Declaration)

Hệ thống hỗ trợ kê khai thuế tự động theo từng bước dưới dạng bản nháp (Draft). Bản nháp này lưu lại số liệu chụp nhanh (Snapshot) từ DB tại thời điểm xác nhận để tránh việc số liệu trên tờ khai bị thay đổi liên tục khi người dùng sửa chứng từ.

### 2.1. Phân Luồng Kê Khai Theo Quy Mô Doanh Thu

Quy trình kê khai thuế tự động phân làm hai luồng tùy thuộc vào nhóm thuế suất của kỳ kế khai (`taxGroupId`):

#### 1. Luồng 3 Bước (Doanh thu <= 1 tỷ / Nhóm Miễn Thuế - `taxGroupId === 1`)
Hộ kinh doanh có quy mô doanh thu dưới ngưỡng chịu thuế/được miễn thuế chỉ cần thực hiện 3 bước:
* **Bước 1**: Xác nhận thông tin Hộ kinh doanh.
* **Bước 2**: Xác nhận doanh thu chịu thuế (Kèm bảng thống kê ngành nghề và giao dịch).
* **Bước 3**: Xem trước tờ khai & Ký nộp (Bỏ qua Bước 3 về Tồn kho và Bước 4 về Chi phí).
* *Ràng buộc:* Nếu FE cố tình gọi API lấy hoặc lưu Bước 3/Bước 4, Backend sẽ chặn lại và ném lỗi `400 Bad Request`.

#### 2. Luồng 5 Bước Đầy Đủ (Doanh thu > 1 tỷ - `taxGroupId !== 1`)
Hộ kinh doanh quy mô lớn thực hiện đầy đủ 5 bước:
* **Bước 1**: Xác nhận thông tin Hộ kinh doanh.
* **Bước 2**: Xác nhận doanh thu chịu thuế.
* **Bước 3**: Xác nhận tổng hợp giá trị Tồn kho.
* **Bước 4**: Xác nhận chi tiết Chi phí kinh doanh.
* **Bước 5**: Xem trước tờ khai & Ký nộp.

---

### 2.2. Bản Đồ API Tiến Trình Kê Khai Thuế

| Bước | Method | Endpoint | Request Body | Mô tả & Ràng buộc nghiệp vụ |
| :---: | :---: | :--- | :--- | :--- |
| **Khởi tạo** | `GET` | `/tax-declaration/init` | Không có | Lấy kỳ thuế hiện tại cần kê khai và trạng thái nút bấm "Lập tờ khai". |
| **Bắt đầu** | `POST` | `/tax-declaration/start` | `{ "periodIdPublicId": "fp-public-id" }` | Tạo phiên làm việc mới (Khởi tạo bản nháp tờ khai trong DB). |
| **B1: Lấy** | `GET` | `/tax-declaration/step-1/:publicId` | Không có | Lấy thông tin cá nhân/HKD đại diện kê khai. |
| **B1: Lưu** | `POST` | `/tax-declaration/step-1/save/:publicId` | `SaveStep1Dto` (Thông tin HKD) | Lưu thông tin HKD vào bản nháp tờ khai. |
| **B2: Lấy** | `GET` | `/tax-declaration/step-2/:publicId` | Không có | Trả về thông tin doanh thu, danh sách ngành nghề và số giao dịch thực tế trong kỳ. |
| **B2: Lưu** | `POST` | `/tax-declaration/step-2/save/:publicId` | Không có (Lưu tự động) | **Snapshot doanh thu**: BE tự tính và chụp nhanh doanh thu từ DB lưu vào nháp. |
| **B3: Lấy** | `GET` | `/tax-declaration/step-3/:publicId` | Không có | Trả về tổng hợp tồn kho: đầu kỳ, nhập trong kỳ, xuất trong kỳ, cuối kỳ. |
| **B3: Lưu** | `POST` | `/tax-declaration/step-3/save/:publicId` | Không có (Lưu tự động) | **Snapshot tồn kho**: BE tự chụp nhanh giá trị kho lưu vào nháp (Chặn đối với nhóm <= 1 tỷ). |
| **B4: Lấy** | `GET` | `/tax-declaration/step-4/:publicId` | Không có | Trả về thống kê các chi phí hợp lệ (theo 6 nhóm của Thông tư 152/2025/TT-BTC). |
| **B4: Lưu** | `POST` | `/tax-declaration/step-4/save/:publicId` | Không có (Lưu tự động) | **Snapshot chi phí**: BE tự chụp nhanh chi phí từ DB lưu vào nháp (Chặn đối với nhóm <= 1 tỷ). |
| **B5: Lấy** | `GET` | `/tax-declaration/step-5/preview/:publicId`| Không có | Xem trước tờ khai mẫu (PDF/HTML layout) và chọn phương thức tính thuế PIT. |
| **Nộp** | `POST` | `/tax-declaration/submit/:publicId` | `SubmitDeclarationDto` | **Ký nộp**: Kiểm tra biến động dữ liệu DB và tiến hành khóa kỳ kế toán. |
| **Nộp đè** | `POST` | `/tax-declaration/submit-force/:publicId` | `SubmitDeclarationDto` | Chụp lại snapshot mới và tiến hành ký nộp đè. |
| **Nộp cũ** | `POST` | `/tax-declaration/submit-ignore-warning/:publicId`| `SubmitDeclarationDto`| Bỏ qua cảnh báo biến động, nộp tờ khai theo số liệu snapshot cũ (Ghi Audit Log). |

---

### 2.3. Chi Tiết Kỹ Thuật Bước 3 - Thống Kê Tồn Kho Tổng Hợp

Để tránh trùng lặp code và tính toán sai lệch, logic tính toán tồn kho tổng hợp đã được chuyển dịch tập trung về module `stocks`.
* **Cơ chế tính toán**:
  * **Giá trị đầu kỳ (`openingValue`)**: Tính tổng giá trị từ các chi tiết phiếu nhập kho (`StockReceiptDetail`) có trạng thái `APPROVED` và loại `sourceType = 'OPENING'`.
  * **Giá trị nhập trong kỳ (`importedValue`)**: Tính tổng giá trị từ các chi tiết phiếu nhập kho có trạng thái `APPROVED` và loại khác `OPENING`.
  * **Giá trị xuất trong kỳ (`exportedValue`)**: Tính tổng giá trị từ các phiếu xuất kho (`StockIssueDetail`) có trạng thái `APPROVED` (sử dụng phép tính nhân ở cơ sở dữ liệu `sd.quantity * COALESCE(sd.final_weighted_unit_cost, sd.provisional_unit_cost, 0)`).
  * **Giá trị cuối kỳ (`closingValue`)**: Bằng `openingValue + importedValue - exportedValue`.
* *Lưu ý cho FE:* API `POST /tax-declaration/step-3/save/:publicId` không yêu cầu body gửi lên. Hệ thống sẽ tự động thực hiện snapshot dữ liệu tồn kho tổng hợp thực tế.

---

### 2.4. Chi Tiết Kỹ Thuật Bước 2 - Doanh Thu Chịu Thuế

Dữ liệu trả về từ API `GET /tax-declaration/step-2/:publicId` chứa các trường phục vụ hiển thị bảng danh mục thuế hộ kinh doanh:
```json
{
  "periodName": "Tháng 05/2026",
  "industries": [
    {
      "categoryName": "Phân phối, cung cấp hàng hóa",
      "vatRate": 1.0,
      "pitRate": 0.5,
      "revenue": 250000000.00
    }
  ],
  "footer": {
    "estimatedVat": 2500000.00,
    "transactionCount": 42
  },
  "confirmedRevenue": 250000000.00
}
```
* **`estimatedVat`**: Thuế GTGT ước tính được tính toán đồng bộ qua dịch vụ tính thuế của kỳ kế toán (`calculatePeriodTax`).
* **`transactionCount`**: Số lượng hóa đơn bán ra có trạng thái `ISSUED` trong kỳ kế toán hiện tại.

---

### 2.5. Luồng Ký Nộp & Xử Lý Biến Động Số Liệu (Submit Flow)

Khi người dùng nhấn nút "Ký nộp" ở bước cuối cùng, hệ thống kiểm tra sự sai lệch giữa số liệu thực tế trong DB hiện tại và số liệu snapshot đã lưu trong bản nháp tờ khai:

1. **Không có biến động**: Kỳ kế toán được chuyển sang trạng thái `CLOSED`. Tờ khai chính thức được tạo lập và lưu trữ.
2. **Có biến động dữ liệu** (Doanh thu hoặc chi phí thực tế trong DB đã bị thay đổi sau khi snapshot):
   * Backend chặn lại và trả về cảnh báo kèm mã lỗi `TAX_DECLARATION_DATA_CHANGED`.
   * Frontend hiển thị hộp thoại cảnh báo với 2 lựa chọn dành cho người dùng:
     * **Lựa chọn A (Đồng bộ số liệu mới - Nộp đè)**: Gọi API `POST /submit-force/:publicId`. Backend sẽ cập nhật snapshot mới nhất từ DB và tiến hành nộp.
     * **Lựa chọn B (Giữ nguyên số liệu cũ - Nộp cũ)**: Gọi API `POST /submit-ignore-warning/:publicId`. Backend sẽ lưu trữ tờ khai theo dữ liệu cũ đã chụp và ghi lại lịch sử ghi đè cảnh báo này vào Audit Log.

---

## 3. Module Sổ Sách Kế Toán (Accounting Books)

Module Sổ sách kế toán phục vụ mục đích kết xuất và theo dõi số liệu các biểu mẫu sổ sách chính thức theo Thông tư 152/2025/TT-BTC.

### 3.1. Phân Loại Chi Phí Thông Tư 152 (S2c Expense Mapping)
Thay thế hoàn toàn mẫu sổ chi phí cũ (S2) bằng mẫu sổ mới (**S2c-HKD**). Khi phân loại danh mục chi tiêu, Backend sử dụng thuộc tính `s2cExpenseMapping` dạng Enum:

* **`ITEM_A`**: Nguyên liệu, vật liệu (Mục a).
* **`ITEM_B`**: Lương và các khoản trích theo lương (Mục b).
* **`ITEM_C`**: Khấu hao tài sản cố định (Mục c).
* **`ITEM_D`**: Dịch vụ mua ngoài (Mục d).
* **`ITEM_E`**: Lãi vay phải trả (Mục đ).
* **`ITEM_F`**: Chi phí khác (Mục e).
* **`NONE`**: Hạng mục thu hoặc chi tiêu cá nhân không được tính vào chi phí hợp lý.

### 3.2. Bản Đồ API Sổ Sách Kế Toán

Tất cả các API yêu cầu Bearer Token và hỗ trợ tham số thời gian `timeFrame` (`"thang_nay"` | `"thang_truoc"` | `"quy_nay"` | `"custom"`):

| Sổ kế toán | API Summary | API Records | Tham số bổ sung & Ràng buộc |
| :--- | :--- | :--- | :--- |
| **Sổ Doanh Thu (S1)** | `GET /accounting-books/revenue/summary` | `GET /accounting-books/revenue/records` | Thống kê doanh thu theo từng hóa đơn `ISSUED`. |
| **Sổ Chi Phí (S2c)** | `GET /accounting-books/expense/summary` | `GET /accounting-books/expense/records` | Lấy chi tiết các phiếu chi hợp lệ có map `s2cExpenseMapping`. |
| **Sổ Tồn Kho (S2d)** | `GET /accounting-books/inventory/summary` | `GET /accounting-books/inventory/records` | Query: `productPublicIds` (dạng chuỗi phân tách bằng dấu phẩy). Trả về tồn kho tổng hợp & chi tiết. |
| **Sổ Dòng Tiền (S2e)** | `GET /accounting-books/cash-flow/summary` | `GET /accounting-books/cash-flow/records` | Query: `bookKey` (`S03` cho Tiền mặt, `S04` cho Ngân hàng). |

### 3.3. Cơ Chế Đồng Bộ syncCode
* **Tại sao cần `syncCode`?** Tránh lệch số liệu giữa Summary Card và bảng Records khi DB có thay đổi trong quá trình xem.
* **Luồng chạy**:
  1. FE gọi API `/summary` để lấy dữ liệu tổng quan và nhận kèm một mã `syncCode` từ BE.
  2. FE lưu `syncCode` này vào State/Store.
  3. Khi gọi API `/records` để lấy danh sách chi tiết (kể cả khi phân trang), FE truyền kèm theo mã `syncCode` này lên.
  4. Nếu DB có thay đổi sau thời điểm lấy summary, BE sẽ trả về `isSummaryOutdated: true` ở API records. Khi đó FE cần gọi lại API `/summary` để lấy dữ liệu và `syncCode` mới, sau đó refresh lại bảng records.
