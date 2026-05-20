# 📄 Invoices Module

Module quản lý **Hóa đơn Bán ra** của Hộ kinh doanh, bao gồm toàn bộ vòng đời từ khởi tạo (`DRAFT`) đến phát hành (`ISSUED`), xử lý lỗi đồng bộ (`SYNC_FAILED`) hoặc hủy (`CANCELED`).

---

## 📁 Cấu trúc thư mục

```
src/invoices/
├── dto/
│   ├── create-invoice.dto.ts        # DTO tạo hóa đơn (header + line items)
│   ├── create-invoice-detail.dto.ts # DTO một dòng hàng (line item)
│   ├── update-invoice.dto.ts        # DTO cập nhật (partial)
│   └── response-invoice.dto.ts      # DTO mapping trả về (exclude trường nhạy cảm)
├── invoices.controller.ts           # Định nghĩa các HTTP Endpoints
├── invoices.service.ts              # Business logic & Transaction, Logging
└── invoices.module.ts               # Đăng ký providers
```

---

## 🔌 API Endpoints

Tất cả endpoint đều yêu cầu **JWT Authentication** (`@UseGuards(JwtAuthGuard)`) và Period Lock (`@CheckPeriod()`). `userId` được trích xuất tự động qua `@CurrentUser('id')`.

| Method  | Path                                 | Mô tả                             | HTTP Code |
| ------- | ------------------------------------ | --------------------------------- | --------- |
| `POST`  | `/invoices`                          | Tạo hóa đơn mới (`DRAFT`)         | 201       |
| `POST`  | `/invoices/:id/publish`              | Phát hành hóa đơn (xin mã CQT)    | 200       |
| `GET`   | `/invoices`                          | Lấy danh sách hóa đơn của user    | 200       |
| `GET`   | `/invoices/:invoicePublicId/details` | Xem chi tiết hóa đơn + line items | 200       |
| `PATCH` | `/invoices/:invoicePublicId`         | Cập nhật hóa đơn (`DRAFT`)        | 200       |
| `PATCH` | `/invoices/:invoicePublicId/cancel`  | Hủy hóa đơn (`ISSUED`)            | 200       |

---

## 🔄 Vòng đời Hóa đơn (Invoice Status Lifecycle)

```
                  ┌────────────────────────────────────────────────────────┐
                  │                                                        │
     POST /invoices (Tạo)                                                  │
          │                                                             [Retry]
          ▼                                                                │
       [DRAFT] ──── POST /publish ────►  [PENDING_ISSUED] ─────────────────┤
          │           (Trừ kho)              │                             │
          │                               (Gọi API CQT)                    │
          │                                  │                             │
          │                                  ├─(Thất bại)─► [SYNC_FAILED] ─┘
   PATCH /:id (Sửa)                          │              (Hoàn lại kho)
          │                                  └─(Thành công)
          │                                      ▼
          └─────────────────────────────►     [ISSUED]  ← Khóa cứng, cấm sửa!
                                                 │
                                           PATCH /cancel
                                            (Hoàn kho, Trừ doanh thu, Hủy phiếu)
                                                 │
                                                 ▼
                                            [CANCELED]
```

| Trạng thái       | Có thể cập nhật (Sửa)? | Có thể phát hành (Publish)? | Có thể Hủy (Cancel)? |
| ---------------- | ---------------------- | --------------------------- | -------------------- |
| `DRAFT`          | ✅ Có                  | ✅ Có                       | ❌ Không             |
| `PENDING_ISSUED` | ❌ Khóa cứng           | ❌ Đang xử lý               | ❌ Không             |
| `SYNC_FAILED`    | ✅ Có                  | ✅ Có (Retry)               | ❌ Không             |
| `ISSUED`         | ❌ Khóa cứng           | ❌ Đã phát hành             | ✅ Có                |
| `CANCELED`       | ❌ Khóa cứng           | ❌ Đã hủy                   | ❌ Đã hủy            |

---

## ⚙️ Service Logic Chi tiết

Tuân thủ nghiêm ngặt chuẩn kiến trúc theo `CONTRIBUTE.md`, đặc biệt là **ACID Transaction** cho tiền và hàng hóa, đi kèm Structured Logging.

### 1. `createInvoice` — Tạo hóa đơn

Luồng xử lý gồm 2 giai đoạn để tối ưu hiệu năng Database:

**Giai đoạn 1 — Pre-flight Checks (Ngoài Transaction)**
Tránh việc giữ DB Lock quá lâu:
- Bắt buộc kiểm tra `isB2C` (nếu false thì phải có thông tin buyer).
- Lấy `Product` lên kiểm tra Owner (`userId`) để chống IDOR. Không có -> 404.
- Kiểm tra số lượng tồn kho `currentStock >= quantity`. Thiếu -> 400.
- Tính tổng tiền `totalPayment`.

**Giai đoạn 2 — ACID Transaction**
1. **Header**: Tạo `Invoice` mới (mặc định status `DRAFT`).
2. **Details**: Lưu snapshot giá (`unitPrice`) và tên (`productNameSnapshot`) tại thời điểm bán (đảm bảo tính bất biến).
3. **Doanh thu**: Sử dụng `upsert` cộng `totalPayment` vào `RevenueTracker` của năm hiện tại (`revenueYtd: { increment }`).
4. **Audit**: `auditLog.logChange` ghi nhận thao tác `CREATE`.

> 💡 **Quan trọng**: Ở bước này, hóa đơn DRAFT **CHƯA** trừ tồn kho thật sự, chỉ mới cộng doanh thu. Kho sẽ bị trừ khi thực sự `publish`.

### 2. `publishInvoice` — Phát hành hóa đơn

Thực hiện đồng bộ với Cơ quan Thuế (CQT) và chốt số lượng kho. Luồng xử lý chia làm 3 Phase để phòng chống rủi ro call API ngoài:

**Phase 1: DB Transaction (Chuẩn bị & Trừ kho)**
- Kiểm tra quyền truy cập và chắc chắn hóa đơn chưa bị khóa cứng (`ISSUED`, `CANCELED`, `PENDING_ISSUED`).
- Chuyển status thành `PENDING_ISSUED`.
- **Trừ tồn kho bằng Optimistic Locking**: 
  `currentStock: { decrement: quantity }` kèm điều kiện tuyệt đối `currentStock: { gte: quantity }`.
  Nếu `count === 0` -> ai đó đã trừ kho ở luồng khác -> Ném lỗi 409 Conflict, tự động Rollback.

**Phase 2: External Service (Mock API)**
- Gọi `taxAuthorityService.requestTaxCode`.

**Phase 3: Xử lý Kết quả (Resolve / Rollback)**
- **Thành công (success = true)**: Gọi tiếp hàm `lockInvoice` để chốt status `ISSUED`, gán `cqtCode`, ghi Audit Trail.
- **Thất bại (success = false)**: Mở 1 DB Transaction mới cập nhật status thành `SYNC_FAILED` và **hoàn trả hàng (increment) vào kho**, giúp user có thể "Retry" gửi lại lần sau.

### 3. `updateInvoice` — Cập nhật hóa đơn chưa phát hành

Chỉ được thực hiện khi hóa đơn ở trạng thái `DRAFT` hoặc `SYNC_FAILED`.
1. Kiểm tra quyền sở hữu.
2. Kiểm tra thông tin B2B/B2C hợp lệ.
3. **Transaction**:
   - Nếu có truyền chi tiết hóa đơn (`details`): Xóa details cũ, check tồn kho lần nữa, tạo details mới.
   - Tính toán bù trừ doanh thu: Nếu tổng tiền mới khác tổng tiền cũ, update vào bảng `RevenueTracker`.
   - Update header của Invoice.
   - Ghi lại AuditLog sự thay đổi bằng JSON.

### 4. `canceledInvoice` — Hủy hóa đơn

Điều kiện: Chỉ cho phép hủy hóa đơn đã phát hành (`ISSUED`).
**ACID Transaction khổng lồ**:
1. Cập nhật `status` -> `CANCELED` sử dụng **Optimistic Lock** (tìm đúng `status: ISSUED`). Nếu count = 0 -> lỗi double click, ngắt giao dịch.
2. **Hoàn tồn kho**: Gọi `productService.updateStockFromCanceledInvoice` để cộng (`INCREMENT`) lại số lượng đã xuất vào bảng Product.
3. **Hủy Phiếu thu**: Gọi `voucherService.bulkCancelByInvoice` gạch bỏ phiếu thu OUTBOUND liên kết với hóa đơn này.
4. **Trừ Doanh thu**: Trừ bớt khoản `totalPayment` khỏi `RevenueTracker` (`decrement`).
5. Ghi AuditLog.

---

## 🔒 Bảo mật & Tính toàn vẹn dữ liệu

Bám sát quy tắc bảo mật từ `CONTRIBUTE.md`:

| Cơ chế | Vị trí áp dụng | Giải thích |
| :--- | :--- | :--- |
| **Ownership Check (Chống IDOR)** | Hàm `validateInvoiceAccess()` | Mọi query DB cho invoice/product đều kẹp chung điều kiện `userId` (Owner) và `publicId`. |
| **Giá Bất Biến (Snapshot)** | `createInvoice`, `updateInvoice` | Không tin tưởng giá trị `unitPrice` client gửi. Luôn query từ Database và lưu snapshot vào InvoiceDetail. |
| **Optimistic Locking (Concurrency)** | `publishInvoice`, `canceledInvoice` | Giải quyết triệt để Race Condition: Trừ kho bằng `where: { currentStock: { gte: qty } }`, Hủy bằng `where: { status: 'ISSUED' }`. |
| **Structured Logging & AuditTrail** | Tất cả methods | Ghi lại toàn bộ hành động (CREATE/UPDATE/DELETE/CANCEL) xuống DB Audit (Snapshot DTO cũ/mới) phục vụ truy vết thuế. Lỗi luôn kèm `reason` chuẩn (VD: `PRODUCT_NOT_FOUND`). |
| **Period Lock (Chốt sổ)** | Controller `@CheckPeriod()` | Các lệnh sửa đổi (POST, PATCH) đều bị Guard chặn nếu kỳ kế toán đó đã bị chốt (Lock). |

---

## 📦 DTO Reference

Các đối tượng DTO quan trọng nằm trong `src/invoices/dto/`.
Dữ liệu trả về luôn sử dụng tiện ích `mapToDto(InvoiceResponseDto, data)` để ẩn khóa ngoại (`userId`, `id` hệ thống), đảm bảo tính trừu tượng.
