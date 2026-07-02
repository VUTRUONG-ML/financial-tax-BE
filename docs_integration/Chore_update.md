# Chore Update - Frontend Integration Notes

Tài liệu này gom các thay đổi cần frontend cập nhật sau khi backend điều chỉnh flow phát hành hóa đơn, period lock và stock receipt payment.

---

## 1. Tax Authority Connection khi phát hành hóa đơn

### Bối cảnh

Frontend hiện đang gọi `GET /tax-authority-connections` mỗi khi người dùng nhấn phát hành hóa đơn. Backend hiện chỉ yêu cầu tài khoản CQT khi hóa đơn thật sự cần cấp mã CQT.

### Logic backend hiện tại

Endpoint phát hành hóa đơn:

```http
POST /invoices/:invoicePublicId/publish?requestCqtCode=true|false
```

Backend xác định có cần CQT bằng logic:

```ts
needsCqt = taxGroupId !== 1 || requestCqtCode === true
```

Ý nghĩa:

- Người dùng thuộc mức doanh thu 2 / nhóm thuế không phải mức 1: luôn cần kết nối CQT khi phát hành.
- Người dùng thuộc mức doanh thu 1: mặc định không cần cấp mã CQT.
- Người dùng mức 1 nhưng muốn xuất hóa đơn có mã CQT cho doanh nghiệp: frontend truyền `requestCqtCode=true` khi publish.

### Frontend cần cập nhật

- Không gọi `GET /tax-authority-connections` vô điều kiện mỗi lần nhấn phát hành.
- Chỉ kiểm tra kết nối CQT trong các trường hợp:
  - Người dùng thuộc mức doanh thu 2 / cần cấp mã CQT bắt buộc.
  - Người dùng mức 1 bật lựa chọn/yêu cầu xuất hóa đơn có mã CQT cho doanh nghiệp.
- Với người dùng mức 1 không yêu cầu mã CQT:
  - Gọi publish không kèm `requestCqtCode=true`.
  - Backend phát hành hóa đơn trực tiếp, không gọi CQT.
- Với người dùng mức 1 có yêu cầu mã CQT:
  - Có thể mở flow mock đăng nhập tài khoản hóa đơn điện tử nếu chưa cấu hình.
  - Sau khi cấu hình/verify xong, gọi publish với `?requestCqtCode=true`.

---

## 2. Period Lock - ảnh hưởng tới frontend

Period lock có ảnh hưởng tới frontend ở hành vi lỗi và field ngày gửi lên, nhưng không yêu cầu đổi UI lớn.

### Tạo mới chứng từ

Các API tạo chứng từ vẫn cần ngày nghiệp vụ trong body để backend xác định kỳ:

- Invoice: `issueDate`
- Stock receipt: `receiptDate`
- Stock issue: `issueDate`
- Voucher: `transactionAt`
- Production order: `transactionAt`

Nếu thiếu ngày, backend có thể trả lỗi `400` dạng thiếu transaction date.

### Thao tác trên chứng từ đã tồn tại

Các API cancel/update/link trên invoice/stock/voucher/production order hiện dùng resource trong `@CheckPeriod(...)`, backend tự lấy ngày từ chính chứng từ theo mã trên URL.

Frontend không cần gửi thêm ngày chỉ để period lock cho các action này.

Ví dụ:

- `PATCH /stock-receipts/:receiptCode/cancel`
- `PATCH /stock-receipts/:receiptCode`
- `POST /stock-receipts/:receiptCode/link-invoice`
- `DELETE /stock-receipts/:receiptCode/link-invoice/:invoicePublicId`
- `PATCH /invoices/:invoicePublicId/cancel`
- `PATCH /vouchers/:voucherCode/cancel`

### Xử lý lỗi

Frontend nên hiển thị rõ lỗi kỳ bị khóa/không hợp lệ từ backend, ví dụ: không cho cập nhật/hủy chứng từ thuộc kỳ đã đóng.

---

## 3. Stock Receipt Payment Method

### Bối cảnh

Trước đây khi tạo hoặc cập nhật phiếu nhập kho với `isPaid=true`, backend tự tạo phiếu chi thanh toán nhưng luôn lưu `paymentMethod = BANK`. Vì vậy nếu frontend chọn thanh toán tiền mặt, dữ liệu voucher vẫn bị lưu là chuyển khoản.

Backend đã cập nhật DTO và service để nhận `paymentMethod` từ frontend.

### API tạo phiếu nhập kho

```http
POST /stock-receipts
```

Request body mới:

```json
{
  "sourceType": "PURCHASE | PRODUCTION | ADJUSTMENT",
  "receiptDate": "Date string (ISO 8601)",
  "supplierName": "string (Optional)",
  "sourceInvoiceNo": "string (Optional)",
  "sourceDocumentUrl": "string (Optional)",
  "note": "string (Optional)",
  "isPaid": "boolean (Optional)",
  "paymentMethod": "CASH | BANK (Optional)",
  "products": [
    {
      "productPublicId": "string",
      "quantity": "number",
      "unitCost": "number"
    }
  ]
}
```

Quy tắc:

- Nếu `isPaid=true`, backend tự tạo voucher loại `PAYMENT` cho phiếu nhập.
- Nếu gửi `paymentMethod`, voucher dùng đúng phương thức đó.
- Nếu `isPaid=true` nhưng không gửi `paymentMethod`, backend fallback `BANK` để tương thích dữ liệu cũ.
- Nếu `isPaid=false` hoặc không gửi `isPaid`, không tạo voucher thanh toán.

### API cập nhật phiếu nhập kho

```http
PATCH /stock-receipts/:receiptCode
```

Request body mới:

```json
{
  "note": "string (Optional)",
  "sourceType": "PURCHASE | PRODUCTION | ADJUSTMENT (Optional)",
  "supplierName": "string (Optional)",
  "isPaid": "boolean (Optional)",
  "paymentMethod": "CASH | BANK (Optional)",
  "linkInvoicePublicId": "string (Optional)",
  "unlinkInvoicePublicId": "string (Optional)"
}
```

Quy tắc:

- Nếu cập nhật `isPaid=true` và chưa có voucher thanh toán, backend tạo voucher mới với `paymentMethod` được gửi lên.
- Nếu cập nhật `paymentMethod` khi phiếu đã `isPaid=true`, backend cập nhật voucher thanh toán đang active.
- Nếu cập nhật `isPaid=false`, backend hủy các voucher thanh toán liên quan và đưa `paidAmount` về `0`.
- Nếu không gửi `paymentMethod`, backend giữ tương thích bằng fallback `BANK` khi cần tạo voucher mới.

### Response stock receipt

Response chi tiết phiếu nhập và danh sách phiếu nhập có field:

```json
{
  "isPaid": "boolean",
  "payment": "UNPAID | CASH | BANK | PAID"
}
```

Ý nghĩa `payment`:

- `UNPAID`: phiếu chưa thanh toán.
- `CASH`: đã thanh toán bằng tiền mặt.
- `BANK`: đã thanh toán qua ngân hàng/chuyển khoản.
- `PAID`: đã thanh toán nhưng không tìm thấy voucher active để suy ra phương thức.
