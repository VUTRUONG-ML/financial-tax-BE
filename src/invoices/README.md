# 📄 Invoices Module

Module quản lý **Hóa đơn Bán ra** của Hộ kinh doanh, bao gồm toàn bộ vòng đời từ khởi tạo (`DRAFT`) đến phát hành (`ISSUED`) hoặc hủy (`CANCELED`).

---

## 📁 Cấu trúc thư mục

```
src/invoices/
├── dto/
│   ├── create-invoice.dto.ts        # DTO tạo hóa đơn (header + line items)
│   ├── create-invoice-detail.dto.ts # DTO một dòng hàng (line item)
│   └── update-invoice.dto.ts        # DTO cập nhật (partial)
├── invoices.controller.ts           # Định nghĩa các HTTP Endpoints
├── invoices.service.ts              # Business logic & Transaction
└── invoices.module.ts               # Đăng ký providers
```

---

## 🔌 API Endpoints

| Method | Path | Mô tả | HTTP Code |
|---|---|---|---|
| `POST` | `/invoices` | Tạo hóa đơn mới (`DRAFT`) | 201 |
| `POST` | `/invoices/:id/publish` | Phát hành hóa đơn (xin mã CQT) | 200 |
| `GET` | `/invoices` | Lấy danh sách hóa đơn của user | 200 |
| `GET` | `/invoices/:invoicePublicId/details` | Xem chi tiết hóa đơn + line items | 200 |
| `PATCH` | `/invoices/:invoicePublicId/cancel` | Hủy hóa đơn | 200 |

> Tất cả endpoint đều yêu cầu **JWT Authentication**. `userId` được trích xuất tự động qua `@CurrentUser('id')`.

---

## 🔄 Vòng đời Hóa đơn (Invoice Status Lifecycle)

```
                  ┌──────────────────────────────┐
                  │                              │
     POST /invoices                         [Retry]
          │                                     │
          ▼                                     │
       [DRAFT] ──── POST /publish ────►  [SYNC_FAILED]
          │                  │
          │           (CQT trả về lỗi)
          │
          │           (CQT trả về thành công)
          └──── POST /publish ────► [ISSUED] ← Khóa cứng, không sửa/hủy được
          │
          └──── PATCH /cancel ────► [CANCELED]
```

| Trạng thái | Có thể hủy? | Có thể phát hành? |
|---|---|---|
| `DRAFT` | ✅ | ✅ |
| `SYNC_FAILED` | ✅ | ✅ (Retry) |
| `ISSUED` | ❌ Khóa cứng | ❌ |
| `CANCELED` | ❌ | ❌ |

---

## ⚙️ Service Logic Chi tiết

### 1. `createInvoice(userId, dto)` — Tạo hóa đơn

Đây là luồng phức tạp nhất, được chia làm **2 giai đoạn** để tối ưu hiệu năng DB.

#### Giai đoạn 1 — Pre-flight Checks *(Ngoài Transaction)*

> ⚠️ Thực hiện TRƯỚC khi mở Transaction để tránh giữ DB lock trong thời gian dài.

```
1. validateInvoiceB2C()
   └─ Nếu isB2C = false (B2B) → bắt buộc có buyerName, buyerTaxCode, buyerAddress

2. Với từng line item trong dto.details (chạy song song với Promise.all):
   ├─ Tìm Product theo publicId
   ├─ Kiểm tra ownership: product.userId === userId
   │    └─ Sai → 403 FORBIDDEN (PRODUCT_OWNERSHIP_VIOLATION)
   ├─ Kiểm tra tồn kho: currentStock >= quantity
   │    └─ Thiếu → 400 BAD_REQUEST (OUT_OF_STOCK)
   └─ Tính lineTotal = sellingPrice × quantity → cộng vào totalPayment
```

#### Giai đoạn 2 — ACID Transaction *(3 bước)*

```
prisma.$transaction(async tx => {
  Bước 1: tx.invoice.create()
          └─ invoiceSymbol = generateInvoiceSymbol()  → VD: "2C26TAA"
          └─ status = DRAFT (mặc định từ schema)
          └─ isPaid = false

  Bước 2: tx.invoiceDetail.createMany()
          └─ Với mỗi line item:
             ├─ productNameSnapshot: product.productName  ← SNAPSHOT BẤT BIẾN
             ├─ unitPrice: product.sellingPrice           ← SNAPSHOT BẤT BIẾN
             ├─ quantity
             └─ totalAmount = unitPrice × quantity

  Bước 3: Trừ currentStock — Optimistic Locking
          └─ tx.product.updateMany({
               where: { id, currentStock: { gte: quantity } },  ← ĐIỀU KIỆN SỐNG CÒN
               data:  { currentStock: { decrement: quantity } }
             })
          └─ Nếu count === 0 → 409 CONFLICT (STOCK_CHANGED_CONCURRENTLY)
             → Prisma tự động ROLLBACK toàn bộ transaction

  Bước 4: auditLog.logChange() — ghi audit trail trong cùng transaction
})
```

> **Tại sao dùng Optimistic Locking ở Bước 3?**
> Pre-flight check đã xác nhận stock đủ, nhưng giữa thời điểm check và thời điểm trừ, một request concurrent khác có thể đã trừ trước. `updateMany` với điều kiện `currentStock >= quantity` đảm bảo chỉ trừ khi stock vẫn còn đủ — nếu ai đó cướp trước thì `count = 0` và toàn bộ transaction bị rollback an toàn.

---

### 2. `canceledInvoice(invPublicId, userId)` — Hủy hóa đơn

#### Điều kiện tiên quyết

`validateInvoiceAccess()` kiểm tra:
- Hóa đơn phải thuộc `userId` → 404 nếu không tìm thấy
- Trạng thái phải là `DRAFT` hoặc `SYNC_FAILED` → 403 nếu đã `ISSUED` hoặc `CANCELED`

#### ACID Transaction — 2 bước

```
prisma.$transaction(async tx => {
  Bước 1: tx.invoice.updateMany()
          └─ where: { id, status: { in: ['DRAFT', 'SYNC_FAILED'] } }  ← Optimistic Lock
          └─ data:  { status: 'CANCELED' }
          └─ Nếu count === 0 → 400 BAD_REQUEST (RACE_CONDITION)
             → Ai đó đã hủy trước → rollback

  Bước 2: tx.invoiceDetail.groupBy({ by: ['productId'], _sum: { quantity } })
          └─ Gom nhóm theo productId → cộng tổng số lượng
          └─ Với mỗi productId:
             tx.product.update({ currentStock: { increment: totalQty } })
             → HOÀN TRẢ tồn kho về Products
})
```

> **Tại sao dùng `groupBy` thay vì loop trực tiếp?**
> Phòng trường hợp một hóa đơn có nhiều dòng hàng cùng một sản phẩm. `groupBy` tổng hợp thành 1 lần `update` duy nhất thay vì N lần riêng lẻ — giảm số lượng round-trip DB, tránh race condition giữa các lần increment.

---

### 3. `publishInvoice(publicId, userId)` — Phát hành hóa đơn

```
1. validateInvoiceAccess() → kiểm tra ownership & trạng thái
2. taxAuthorityService.requestTaxCode(publicId)  ← Gọi Mock API Cơ quan Thuế

   ├─ Thành công (result.success = true):
   │   └─ lockInvoice() → status: ISSUED, gắn cqtCode, ghi auditLog
   │
   └─ Thất bại (result.success = false):
       └─ invoice.update({ status: 'SYNC_FAILED' })
          → Người dùng có thể bấm "Retry" để gọi lại
```

---

### 4. `validateInvoiceAccess(publicId, userId, action)` — Guard dùng chung

Hàm private được tái sử dụng bởi tất cả các method ghi (update/cancel/publish):

```typescript
// Tìm invoice theo publicId VÀ userId trong cùng 1 query
// → Không cần check ownership riêng, tránh IDOR
invoice = prisma.invoice.findFirst({ where: { publicId, userId } })
if (!invoice) throw NotFoundException(...)

// Chỉ chặn nếu action !== 'VIEW'
if (status === 'ISSUED')   throw ForbiddenException(...)  // Khóa cứng
if (status === 'CANCELED') throw ForbiddenException(...)  // Đã hủy
```

---

## 📦 DTO Reference

### `CreateInvoiceDto`

| Field | Type | Required | Ghi chú |
|---|---|---|---|
| `isB2C` | `boolean` | ❌ | Mặc định `true` (B2C) |
| `buyerName` | `string` | ❌ | Bắt buộc khi `isB2C = false` |
| `buyerTaxCode` | `string` | ❌ | Bắt buộc khi `isB2C = false` |
| `buyerAddress` | `string` | ❌ | Bắt buộc khi `isB2C = false` |
| `details` | `CreateInvoiceDetailDto[]` | ✅ | Tối thiểu 1 item |

### `CreateInvoiceDetailDto`

| Field | Type | Required | Ghi chú |
|---|---|---|---|
| `productPublicId` | `string` | ✅ | publicId (cuid) của sản phẩm |
| `quantity` | `number` (int) | ✅ | Tối thiểu 1 |

> `unitPrice` và `productNameSnapshot` **không nhận từ client** — được lấy từ DB tại thời điểm tạo để đảm bảo tính bất biến của chứng từ.

---

## 🔒 Bảo mật & Tính toàn vẹn dữ liệu

| Cơ chế | Áp dụng ở | Mục đích |
|---|---|---|
| **Ownership check tích hợp trong query** | `validateInvoiceAccess` | Chống IDOR (Insecure Direct Object Reference) |
| **Price snapshot** | `createInvoice` — Bước 2 | Chứng từ không bị sai lệch khi sản phẩm đổi giá sau |
| **Optimistic Locking (create)** | `createInvoice` — Bước 3 | Chống race condition khi trừ tồn kho đồng thời |
| **Optimistic Locking (cancel)** | `canceledInvoice` — Bước 1 | Chống double-click hủy cùng lúc |
| **Status lock** | `validateInvoiceAccess` | Hóa đơn `ISSUED` không thể bị sửa/hủy |
| **AuditLog trong Transaction** | `createInvoice`, `lockInvoice` | Đảm bảo audit trail không mất khi rollback |
