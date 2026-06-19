# Inbound Invoice (Hóa đơn đầu vào) & Stock Receipt Integration

Tài liệu này mô tả chi tiết kiến trúc, logic nghiệp vụ và các API liên quan đến Module Hóa đơn đầu vào (`InboundInvoice`) và sự tích hợp với Phiếu nhập kho (`StockReceipt`).

---

## 1. Vai trò nghiệp vụ
- **InboundInvoice (Hóa đơn đầu vào)** đóng vai trò thuần túy là **Chứng từ Thuế và Kế toán Mua hàng** được đồng bộ trực tiếp từ Cơ quan Thuế (hoặc T-VAN). Người dùng (Hộ kinh doanh) **không được tự ý tạo, chỉnh sửa hoặc xóa** hóa đơn này.
- **StockReceipt (Phiếu nhập kho)** đại diện cho việc **thực tế nhận hàng hóa vật lý** tại kho. Người dùng tạo Phiếu nhập kho thủ công và có thể liên kết nó tới một hoặc nhiều Hóa đơn đầu vào tương ứng để đối soát.

---

## 2. Logic Đồng bộ hóa đơn (Tax Authority Sync Simulation)
API của Cơ quan Thuế/T-VAN chỉ trả về danh sách các hóa đơn có mã số thuế người mua (Buyer Tax Code) trùng với MST của Hộ kinh doanh.
- **Background Sync**: Lớp `InvoiceSyncService` sử dụng một vòng lặp `setInterval` chạy ngầm mô phỏng việc tải file XML/PDF từ Cơ quan Thuế, phân tích cú pháp (parse) và lưu thông tin hóa đơn.
- **Mã số thuế & Liên kết**: Dữ liệu hóa đơn chỉ được tải về nếu tài khoản Thuế được cấu hình và xác thực qua module `tax-authority-connections`.
- **Nhất quán Sản phẩm & Giá nhập**:
  - Hóa đơn đầu vào liên kết trực tiếp tới danh mục sản phẩm của người dùng thông qua mã sản phẩm (`productId`).
  - **Giá nhập (Unit Cost)** trên hóa đơn được xác định dựa trên thông tin **Giá nhập thực tế đầu kỳ (`openingStockUnitCost`)** của sản phẩm đó. Nếu chưa thiết lập giá nhập đầu kỳ, hệ thống sẽ sử dụng mức giá bán lẻ giảm đi 1.5 lần làm giá nhập mặc định.

---

## 3. Quy trình Liên kết & Tự động điều chỉnh Giá (Auto-Adjustment)
Khi người dùng thực hiện liên kết một hóa đơn đầu vào tới một phiếu nhập kho (`POST /stock-receipts/:receiptId/link-invoice`):
1. **Kiểm tra tính hợp lệ**: Đảm bảo cả hóa đơn và phiếu nhập đều tồn tại và thuộc về cùng một người dùng.
2. **Auto-Adjustment (Tự động điều chỉnh giá)**: Do phiếu nhập kho có thể được lập trước với giá tạm tính ("Hàng về trước, hóa đơn về sau"), khi thực hiện mapping, hệ thống sẽ tự động cập nhật đè giá chính thức từ hóa đơn vào phiếu nhập:
   - Cập nhật `unitCost` và `totalValue` của các dòng trong bảng `StockReceiptDetail` khớp với đơn giá trên hóa đơn.
   - Cập nhật tương ứng các dòng trong bảng `InventoryMovement` sinh ra bởi phiếu nhập này để đảm bảo giá vốn tồn kho được phản ánh chính xác.
   - Cập nhật tổng thành tiền `totalValue` của phiếu nhập `StockReceipt` dựa trên các chi tiết vừa điều chỉnh.
   - **Số lượng (Quantity)** được giữ nguyên theo thực tế nhập kho vật lý để tránh sai lệch kiểm kê.

---

## 4. Danh sách các API liên quan

### A. Nhóm API Hóa đơn đầu vào (`inbound-invoices`)

#### 1. Lấy danh sách Hóa đơn đầu vào
- **Endpoint**: `GET /inbound-invoices`
- **Query Params**:
  - `page` (Mặc định: 1)
  - `limit` (Mặc định: 20)
  - `type` (Mô tả loại hóa đơn)
- **Mô tả**: Trả về danh sách hóa đơn đầu vào đã đồng bộ từ Cơ quan Thuế của người dùng hiện tại.

#### 2. Lấy thông tin chi tiết Hóa đơn đầu vào (Hỗ trợ Auto-fill)
- **Endpoint**: `GET /inbound-invoices/:publicId`
- **Mô tả**: Trả về chi tiết các dòng hàng trên hóa đơn để Frontend có thể tự động điền (Auto-fill) vào form tạo Phiếu nhập kho.

#### 3. Lấy báo cáo tổng quan hóa đơn đầu vào
- **Endpoint**: `GET /inbound-invoices/summary`
- **Mô tả**: Trả về thống kê tổng số lượng hóa đơn, tổng số tiền mua hàng, và tổng số tiền còn nợ nhà cung cấp.

#### 4. Kích hoạt đồng bộ hóa đơn thủ công
- **Endpoint**: `POST /inbound-invoices/trigger-sync`
- **Mô tả**: Kích hoạt đồng bộ hóa đơn mô phỏng ngay lập tức thay vì chờ đến chu kỳ chạy ngầm tiếp theo.

---

### B. Nhóm API Liên kết & Đối soát Phiếu nhập (`stock-receipts`)

#### 1. Lấy danh sách Phiếu nhập kho
- **Endpoint**: `GET /stock-receipts`
- **Mô tả**: Trả về danh sách phiếu nhập kho hiện có của người dùng.

#### 2. Tạo Phiếu nhập kho (Tạm tính)
- **Endpoint**: `POST /stock-receipts`
- **Body**: `CreateStockReceiptDto`
- **Mô tả**: Tạo phiếu nhập kho vật lý và ghi nhận giá trị tạm tính.

#### 3. Liên kết Phiếu nhập với Hóa đơn & Tự động cập nhật giá
- **Endpoint**: `POST /stock-receipts/:receiptId/link-invoice`
- **Body**: `{ "invoicePublicId": "cuid_hoa_don" }`
- **Mô tả**: Thực hiện liên kết hóa đơn với phiếu nhập. Hệ thống sẽ tự động cập nhật lại đơn giá nhập kho và giá trị trên phiếu nhập + thẻ kho theo đơn giá chính thức trên hóa đơn.

#### 4. Hủy liên kết Phiếu nhập và Hóa đơn
- **Endpoint**: `DELETE /stock-receipts/:receiptId/link-invoice/:invoiceId`
- **Mô tả**: Xóa mối quan hệ liên kết giữa hóa đơn đầu vào và phiếu nhập kho.

#### 5. Xem danh sách hóa đơn liên kết của một Phiếu nhập
- **Endpoint**: `GET /stock-receipts/:receiptId/invoices`
- **Mô tả**: Lấy danh sách hóa đơn đã được liên kết với phiếu nhập kho tương ứng.

#### 6. Đối soát chênh lệch chi tiết (Reconciliation)
- **Endpoint**: `GET /stock-receipts/:receiptCode`
- **Mô tả**: Thực hiện kiểm tra so sánh và trả về chi tiết đối soát chênh lệch:
  - `TOTAL_AMOUNT_MISMATCH`: Chênh lệch tổng tiền hóa đơn và phiếu nhập.
  - `PRODUCT_MISSING`: Sản phẩm có trên hóa đơn nhưng không có trong phiếu nhập.
  - `QUANTITY_MISMATCH`: Chênh lệch số lượng thực nhập và số lượng hóa đơn.
  - `UNIT_COST_MISMATCH`: Chênh lệch đơn giá (ở mức cảnh báo `WARNING` nếu lệch > 100k, hoặc `INFO` nếu lệch nhỏ).
