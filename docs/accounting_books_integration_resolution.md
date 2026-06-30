# 📋 Giải Đáp Phản Hồi Từ Frontend — Đối Chiếu & Bổ Sung Hướng Xử Lý Kỹ Thuật (Module Sổ Kế Toán)

**Ngày lập:** 2026-06-29  
**Người thực hiện:** Antigravity (AI Pair Programmer)  
**Tập trung giải quyết:** 3 điểm lo ngại/complain của Frontend (RG1 - TNCN, RG2 - Ngành nghề/Category, RG3 - Phân trang S2d).

---

## 1. Giải Đáp Complain RG1: Thuế TNCN trên Sổ doanh thu S2a (`Thue_TNCN` & dòng tổng TNCN)

### 1.1. Vấn đề của FE

FE lo ngại không có trường `Thue_TNCN` ở mỗi dòng của sổ S2a trong contract, dẫn đến việc dòng tổng PIT không có nguồn hiển thị và không thể tự nhân tỷ lệ tại FE.

### 1.2. Phản hồi và Hướng xử lý từ BE

- **Số liệu dòng tổng (Autoritative Summary):**
  - Số liệu dòng tổng thuế TNCN của cả kỳ **không được tính bằng cách cộng dồn cột trên các dòng hoặc tự nhân tỷ lệ ở FE**.
  - FE lấy giá trị tổng chính thức từ **API Summary** (`GET /v1/accounting-books/revenue/summary`).
  - Trong dữ liệu trả về cho Sổ S2a (`activeBookKey === 'S2a-HKD'`), phần `summary` **ĐÃ cung cấp đầy đủ** trường: **`Tong_Thue_TNCN_Phai_Nop`**.
- **Số thuế trên từng dòng (Records):**
  - Luật thuế quy định thuế TNCN của Hộ kinh doanh được xác định và kê khai tập trung cuối kỳ/năm, không khấu trừ trực tiếp trên từng hóa đơn bán ra (không giống như thuế GTGT). Vì vậy Backend **không thiết kế trường `Thue_TNCN` trên từng dòng hóa đơn** của `S2ARowDto`.
- **Hướng xử lý cho FE:**
  - Cột thuế TNCN trên từng dòng của bảng S2a: Hiển thị trống hoặc ký hiệu `—` (hoặc ẩn cột chi tiết dòng nếu UI cũ cho phép).
  - Dòng tổng dưới chân bảng: Hiển thị giá trị **`Tong_Thue_TNCN_Phai_Nop`** lấy từ API Summary. Tuyệt đối không tự tính toán hay cộng dồn.

---

## 2. Giải Đáp Complain RG2: Hạng mục ngành nghề trên S2a/S2b (Category & taxCategoryId)

### 2.1. Vấn đề của FE

FE cần thông tin ngành nghề/danh mục của từng hóa đơn để thực hiện gom nhóm hiển thị (nhóm 4 nhóm ngành kinh doanh GTGT/TNCN), đồng thời S2b hiện tại thiếu trường `Thue_GTGT` trong khi FE yêu cầu hiển thị.

### 2.2. Phản hồi và Hướng xử lý từ BE

- **Trường ngành nghề/danh mục (Category):**
  - API Records của sổ doanh thu (`GET /v1/accounting-books/revenue/records`) trả về mảng kết quả kèm theo thuộc tính **`totalsByIndustry`** ở root response.
  - **`totalsByIndustry`** là danh sách các ngành nghề chịu thuế có phát sinh doanh thu trong kỳ đó, bao gồm: `taxCategoryId`, `categoryName`, `revenue`, `vatAmount`, `pitAmount`.
  - **Hướng xử lý cho FE:** Sử dụng mảng `totalsByIndustry` này để hiển thị phần thống kê nhóm ngành nghề chịu thuế ở đầu/cuối bảng. Không cần tự lặp qua từng row chi tiết để tính toán và gom nhóm.
- **Cột thuế GTGT trên Sổ S2b:**
  - Theo Thông tư 152/2025/TT-BTC, sổ **S2b-HKD** chỉ là sổ chi tiết doanh thu bán hàng hóa, dịch vụ, **không có cột thuế GTGT** trên biểu mẫu tiêu chuẩn. Cột thuế GTGT chỉ xuất hiện trên Sổ **S2a-HKD** (Sổ doanh thu và thuế theo tỷ lệ).
  - **Hướng xử lý cho FE:**
    - Khi tab hoạt động là S2b (`activeBookKey === 'S2b-HKD'`), FE ẩn cột thuế GTGT.
    - Khi tab hoạt động là S2a (`activeBookKey === 'S2a-HKD'`), FE hiển thị cột thuế GTGT và lấy giá trị từ trường **`Thue_GTGT`** (đã được map từ `taxPayable` của hóa đơn).

---

## 3. Giải Đáp Complain RG3: Phân trang trên Sổ tồn kho S2d (Pagination in POST)

### 3.1. Vấn đề của FE

FE nhận thấy API Records của Sổ tồn kho S2d dùng phương thức `POST` gửi JSON body nhưng lo ngại thiếu các tham số phân trang (`page`, `limit`) và không rõ records trả về dạng phân trang hay full dataset.

### 3.2. Phản hồi và Hướng xử lý từ BE

- **Quy tắc Phân trang S2d:**
  - Sổ tồn kho S2d là sổ theo dõi chi tiết nhập - xuất - tồn của **một sản phẩm duy nhất tại một thời điểm** (`productPublicId` là bắt buộc trong body).
  - Vì theo dõi biến động nhập xuất của một sản phẩm đơn lẻ trong một kỳ kế toán (tháng/quý) có số lượng dòng phát sinh rất ít, Backend **không phân trang** cho API Sổ tồn kho S2d.
  - **Đặc tả API:** API `POST /v1/accounting-books/inventory/records` trả về **toàn bộ (full dataset)** fluctuation movements của sản phẩm đó trong kỳ. Response **không chứa cấu trúc phân trang `meta`** (`page`, `limit`, `lastPage`).
- **Hướng xử lý cho FE:**
  - Khi render Sổ tồn kho S2d, FE ẩn component Paginator (phân trang).
  - Render trực tiếp toàn bộ mảng `rows` nhận được từ API.
  - Khi export Excel/PDF cho S2d, FE xuất trực tiếp mảng dữ liệu records nhận được mà không cần thực hiện luồng lặp request phân trang (fetch all pages loop).

---

## 4. Giải Đáp Về Cơ Chế Lựa Chọn & Hiển Thị Sổ Doanh Thu (S1a / S2a / S2b)

### 4.1. Vấn đề của FE

FE chưa rõ logic điều phối hiển thị khi gọi các API doanh thu. Liệu FE tự kiểm tra mức doanh thu để hiển thị S1a, S2a, S2b hay BE sẽ trả về một cấu trúc động.

### 4.2. Cơ chế quyết định của Backend

Backend quản lý tập trung và tự động định đoạt loại sổ doanh thu được phép sử dụng dựa trên nhóm cấu hình thuế (`taxGroupId`) đang áp dụng cho Hộ kinh doanh tại kỳ đó:

1. **Trường hợp `taxGroupId === 1` (Nhóm Miễn Thuế - Doanh thu $\le$ max mức 1)**:
   - BE chỉ kích hoạt duy nhất sổ doanh thu đơn giản **`S1a-HKD`**.
   - API Summary trả về dữ liệu duy nhất trong key `S1a-HKD` và gán `activeBookKey = 'S1a-HKD'`.
   - API Records trả về danh sách dòng ánh xạ theo lớp DTO `S1ARowDto` (`Ngay_Thang`, `Dien_Giai`, `So_Tien`).
2. **Trường hợp `taxGroupId === 2` (Nhóm nộp thuế theo tỷ lệ hoặc mức 2)**:
   - BE kích hoạt **cả hai sổ** **`S2a-HKD`** và **`S2b-HKD`** bên trong API Summary.
   - API Summary đặt mặc định `activeBookKey = 'S2a-HKD'`.
   - Khi FE gọi API Records, BE tự động ánh xạ cấu trúc dòng dựa vào `taxGroupId` hiện hành:
     - Nếu `taxGroupId === 2`: Trả về `rows` theo định dạng `S2ARowDto` (`Ngay_Thang`, `Dien_Giai`, `So_Tien`, `So_Hieu_Chung_Tu`, `Thue_GTGT`) và gán `activeBookKey = 'S2a-HKD'`.
3. **Trường hợp `taxGroupId >= 3` (Các nhóm còn lại)**:
   - BE chỉ kích hoạt sổ doanh thu bán hàng hóa, dịch vụ **`S2b-HKD`**.
   - API Summary trả về dữ liệu key `S2b-HKD` và gán `activeBookKey = 'S2b-HKD'`.
   - API Records trả về `rows` theo định dạng `S2BRowDto` (`Ngay_Thang`, `Dien_Giai`, `So_Tien`, `So_Hieu_Chung_Tu`) và gán `activeBookKey = 'S2b-HKD'`.

### 4.3. Hướng dẫn thiết kế giao diện và Điều phối tab cho Frontend (FE Action Rules)
* **Đối với API Summary:** 
  - FE gọi endpoint `GET /v1/accounting-books/revenue/summary` 1 lần duy nhất để tải toàn bộ cấu trúc các sổ khả dụng nằm trong đối tượng `books` (`books['S1a-HKD']`, `books['S2a-HKD']`, và `books['S2b-HKD']`).
  - Giao diện FE sẽ render các tab cho phép người dùng bấm xem dựa trên sự tồn tại của các key này:
    - **`taxGroupId === 1`**: Đối tượng `books` chỉ có key `'S1a-HKD'`. FE chỉ hiển thị duy nhất tab sổ **S1a**.
    - **`taxGroupId === 2`**: Đối tượng `books` chứa đồng thời cả 2 key `'S2a-HKD'` và `'S2b-HKD'`. FE sẽ hiển thị **cả 2 tab** **S2a** và **S2b** để người dùng có thể nhấp chọn qua lại.
    - **`taxGroupId >= 3`**: Đối tượng `books` chỉ có key `'S2b-HKD'`. FE chỉ hiển thị duy nhất tab sổ **S2b**.
* **Đối với API Records (Dòng dữ liệu):**
  - FE gọi endpoint `GET /v1/accounting-books/revenue/records` 1 lần để lấy danh sách dòng chứng từ `rows`.
  - **Lưu ý quan trọng về DTO dòng trả về:**
    - Khi `taxGroupId === 2`, API Records trả về mảng `rows` được Backend ánh xạ theo lớp **`S2ARowDto`** (chứa trường `Thue_GTGT`) và gán `activeBookKey = 'S2a-HKD'`.
    - **Cách FE xử lý khi người dùng đổi Tab (S2a ↔ S2b) ở mức doanh thu 2:**
      - FE **không cần** gọi lại API Records khi đổi tab.
      - **Khi xem Tab S2a:** FE hiển thị layout bảng đầy đủ các cột và map dữ liệu dòng bao gồm cả cột thuế GTGT (trường `Thue_GTGT`).
      - **Khi xem Tab S2b:** FE hiển thị layout bảng S2b (ẩn cột thuế GTGT) và map dữ liệu dòng từ cùng mảng `rows` nhận được (bằng cách bỏ qua không hiển thị trường `Thue_GTGT` lên UI).
  - Điều này giúp tối ưu hóa hiệu năng, giảm số lượng request tải trang, và đảm bảo dữ liệu hiển thị đồng nhất ở cả 2 tab.
