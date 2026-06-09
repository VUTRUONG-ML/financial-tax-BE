# 📋 API Integration Guide: Hóa Đơn Bán Ra (Outbound Invoices)

**Document Version:** 1.0  
**Last Updated:** 2026-05-28  
**Module:** `src/invoices`  
**Frontend Integration Plan:** `docs-coding-guidelines/plan_api_outboundInvoice.md`

---

## 📌 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Authentication & Security](#authentication--security)
3. [Data Models & DTO](#data-models--dto)
4. [API Endpoints](#api-endpoints)
5. [Request/Response Examples](#requestresponse-examples)
6. [Field Mapping Guide](#field-mapping-guide)
7. [Error Handling](#error-handling)
8. [Integration Flow](#integration-flow)
9. [Testing Checklist](#testing-checklist)

---

## 🎯 Tổng Quan

### Module Purpose
Module **Invoices** quản lý vòng đời hóa đơn bán ra (Outbound) từ khởi tạo (`DRAFT`) → phát hành (`ISSUED`) → huỷ (`CANCELED`).

### Key Features
- ✅ Tạo hóa đơn DRAFT (không trừ kho ngay)
- ✅ Cập nhật thông tin hóa đơn chưa phát hành
- ✅ Phát hành hóa đơn (trừ kho + xin mã CQT)
- ✅ Xử lý lỗi đồng bộ (`SYNC_FAILED` → retry)
- ✅ Huỷ hóa đơn (hoàn kho + trừ doanh thu)
- ✅ Snapshot giá & tên sản phẩm (Bất Biến)

### Invoice Status Lifecycle

```
         [DRAFT] 
          ↓ (Publish)
    [PENDING_ISSUED]
      ↙ (Success) ↘ (Failed)
  [ISSUED]      [SYNC_FAILED]
    ↓ (Cancel)        ↓ (Retry)
[CANCELED]      Back to [PENDING_ISSUED]
```

| Status | Có sửa? | Có phát hành? | Có huỷ? | Mô tả |
|--------|--------|---------------|--------|-------|
| `DRAFT` | ✅ Có | ✅ Có | ❌ Không | Chưa gửi CQT |
| `PENDING_ISSUED` | ❌ Không | ❌ Không | ❌ Không | Đang gửi tới CQT |
| `SYNC_FAILED` | ✅ Có | ✅ Có (Retry) | ❌ Không | Lỗi gửi CQT, có thể thử lại |
| `ISSUED` | ❌ Không | ❌ Không | ✅ Có | Đã phát hành (Khóa cứng) |
| `CANCELED` | ❌ Không | ❌ Không | ❌ Không | Đã huỷ (Khóa cứng) |

> Backed dùng PENDING_ISSUED để thực hiện logic, frontend ko cần quan tâm đến status này.

---

## 🔐 Authentication & Security

### Authentication Method
**Bearer Token (JWT)** trong header `Authorization`:
```http
GET /invoices HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Security Layers
1. **JWT Guard** - Xác thực user
2. **Ownership Check** - Chỉ xem được hóa đơn của user đó
3. **Period Lock** - Không cho sửa hóa đơn nếu kỳ kế toán đã chốt
4. **Optimistic Locking** - Chống Race Condition (trừ kho)

### Permissions
- ✅ Tạo hóa đơn của user hiện tại
- ✅ Xem & sửa hóa đơn của user đó
- ❌ Không thể xem/sửa hóa đơn user khác
- ❌ Không sửa hóa đơn nếu kỳ kế toán đã chốt

---

## 📦 Data Models & DTO

### 1. InvoiceResponseDto (Trả về từ API)

```typescript
interface InvoiceResponseDTO {
  publicId: string;                // ID độc nhất (dùng thay cho systemId)
  invoiceSymbol: string;           // Ký hiệu hóa đơn (VD: C1/21A-001)
  isB2C: boolean;                  // B2C (Hộ kinh doanh) vs B2B (Công ty)
  buyerName: string | null;        // Tên khách (null nếu B2C)
  buyerTaxCode: string | null;     // Mã số thuế khách (null nếu B2C)
  buyerAddress: string | null;     // Địa chỉ khách
  buyerEmail: string | null;       // Email khách
  buyerIdNumber: string | null;    // CMND/CCCD khách
  status: "DRAFT" | "PENDING_ISSUED" | "ISSUED" | "SYNC_FAILED" | "CANCELED";
  isPaid: boolean;                 // Đã thanh toán?
  totalPayment: number;            // Tổng cộng (đã bao gồm thuế)
  paidAmount: number;              // Tiền đã trả
  remainingAmount: number;         // Tiền còn nợ = totalPayment - paidAmount
  cqtCode: string | null;          // Mã số do CQT cấp (sau khi publish)
  paymentMethod: "CASH" | "BANK";  // Hình thức thanh toán
  taxRate: number;                 // Suất thuế GTGT (%)
  taxPayable: number;              // Tiền thuế phải nộp
  cancellationReason: string | null; // Lý do huỷ
  issueDate: string;               // Ngày phát hành (ISO 8601)
  createdAt: string;               // Ngày tạo (ISO 8601)
  details: InvoiceDetailResponseDTO[];
}
```

### 2. InvoiceDetailResponseDto (Chi tiết từng dòng hàng)

```typescript
interface InvoiceDetailResponseDTO {
  id: number;                      // Key render list (nội bộ BE)
  productNameSnapshot: string;     // Tên sản phẩm lúc bán (Snapshot)
  quantity: number;                // Số lượng
  unitPrice: number;               // Đơn giá (tính từ currentStock / sellingPrice)
  totalAmount: number;             // Thành tiền = quantity * unitPrice
  productPublicId: string;         // Link tới sản phẩm (dùng để xem chi tiết)
  unit: string;                    // Đơn vị (cái, hộp, kg...)
  productType: "FINISHED_GOOD" | "RAW_MATERIAL" | "SERVICE";
}
```

### 3. CreateInvoiceRequestDTO

```typescript
interface CreateInvoiceRequestDTO {
  // === Thông tin khách (bắt buộc) ===
  isB2C: boolean | null;           // null = undefined, false = B2B
  buyerName: string | null;        // Bắt buộc nếu B2B
  buyerTaxCode: string | null;     // Optional cho B2B
  buyerAddress: string | null;     // Optional
  buyerEmail: string | null;       // Optional
  buyerIdNumber: string | null;    // Optional

  // === Thanh toán (bắt buộc) ===
  paymentMethod: "CASH" | "BANK";

  // === Chi tiết hóa đơn (bắt buộc) ===
  details: Array<{
    productPublicId: string;       // ID sản phẩm
    quantity: number;              // Số lượng bán
  }>;
}
```

**Lưu ý quan trọng:**
- ❌ **KHÔNG gửi:** `unitPrice`, `totalAmount`, `taxPayable`, `issueDate`
- ✅ **Backend sẽ:** Tự tính toán từ giá bán hiện tại
- ❌ **Không bao gồm:** Trừ kho (chỉ trừ khi publish)

### 4. UpdateInvoiceRequestDTO

```typescript
interface UpdateInvoiceRequestDTO {
  // Các field này đều optional (partial update)
  isB2C?: boolean;
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerIdNumber?: string;
  paymentMethod?: "CASH" | "BANK";
  
  // Cập nhật chi tiết hóa đơn (optional)
  // Nếu có -> xóa chi tiết cũ, tạo chi tiết mới
  details?: Array<{
    productPublicId: string;
    quantity: number;
  }>;
}
```

### 5. CancelInvoiceRequestDTO

```typescript
interface CancelInvoiceRequestDTO {
  cancellationReason: string;  // Bắt buộc: lý do huỷ
}
```

---

## 🔌 API Endpoints

### 1. Create Invoice (Tạo hóa đơn mới)

**Endpoint:** `POST /invoices`  
**Auth:** ✅ Required (JWT Bearer)  
**Period Lock:** ✅ Checked  
**Returns:** `201 Created`

#### Request Body
```json
{
  "isB2C": true,
  "buyerName": null,
  "buyerTaxCode": null,
  "buyerAddress": null,
  "buyerEmail": null,
  "buyerIdNumber": null,
  "paymentMethod": "CASH",
  "details": [
    {
      "productPublicId": "prod-uuid-001",
      "quantity": 5
    },
    {
      "productPublicId": "prod-uuid-002",
      "quantity": 2
    }
  ]
}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-05-28T10:30:00Z",
  "message": "Invoice created successfully.",
  "data": {
    "publicId": "inv-uuid-001",
    "invoiceSymbol": "C1/21A-001",
    "isB2C": true,
    "buyerName": null,
    "buyerTaxCode": null,
    "buyerAddress": null,
    "status": "DRAFT",
    "isPaid": false,
    "totalPayment": 5500000,
    "paidAmount": 0,
    "remainingAmount": 5500000,
    "cqtCode": null,
    "paymentMethod": "CASH",
    "buyerEmail": null,
    "buyerIdNumber": null,
    "taxRate": 10,
    "taxPayable": 500000,
    "cancellationReason": null,
    "issueDate": "2026-05-28T00:00:00Z",
    "createdAt": "2026-05-28T10:30:00Z",
    "details": [
      {
        "id": 1,
        "productNameSnapshot": "Điều hòa LG",
        "quantity": 5,
        "unitPrice": 500000,
        "totalAmount": 2500000,
        "productPublicId": "prod-uuid-001",
        "unit": "cái",
        "productType": "FINISHED_GOOD"
      },
      {
        "id": 2,
        "productNameSnapshot": "Máy giặt Samsung",
        "quantity": 2,
        "unitPrice": 1500000,
        "totalAmount": 3000000,
        "productPublicId": "prod-uuid-002",
        "unit": "cái",
        "productType": "FINISHED_GOOD"
      }
    ]
  },
  "meta": null
}
```

#### Error Cases
```json
// 400: Invalid request
{
  "success": false,
  "statusCode": 400,
  "message": "Buyer information is required for B2B invoices",
  "data": null,
  "meta": null
}

// 409: Insufficient stock
{
  "success": false,
  "statusCode": 409,
  "message": "Product stock is insufficient",
  "data": {
    "productPublicId": "prod-uuid-001",
    "required": 10,
    "available": 5
  },
  "meta": null
}

// 404: Product not found
{
  "success": false,
  "statusCode": 404,
  "message": "Product not found",
  "data": null,
  "meta": null
}

// 423: Period locked
{
  "success": false,
  "statusCode": 423,
  "message": "Financial period is locked. Cannot create invoice.",
  "data": null,
  "meta": null
}
```

---

### 2. Get All Invoices (Danh sách hóa đơn)

**Endpoint:** `GET /invoices`  
**Auth:** ✅ Required  
**Query Parameters:**
- `page`: `number` (default: 1)
- `limit`: `number` (default: 10)

#### Request
```http
GET /invoices?page=1&limit=20
Authorization: Bearer {token}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T10:35:00Z",
  "message": "Get all invoice own success",
  "data": [
    {
      "publicId": "inv-uuid-001",
      "invoiceSymbol": "C1/21A-001",
      "isB2C": true,
      "status": "ISSUED",
      "totalPayment": 5500000,
      "paidAmount": 0,
      "remainingAmount": 5500000,
      "cqtCode": "2021-001-001",
      "createdAt": "2026-05-28T10:30:00Z",
      // ... other fields
    },
    {
      "publicId": "inv-uuid-002",
      "invoiceSymbol": "C1/21A-002",
      "isB2C": false,
      "buyerName": "Công ty ABC",
      "status": "DRAFT",
      "totalPayment": 3000000,
      "paidAmount": 0,
      "remainingAmount": 3000000,
      "cqtCode": null,
      "createdAt": "2026-05-28T11:00:00Z",
      // ... other fields
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "lastPage": 3
  }
}
```

---

### 3. Get Invoice Details (Chi tiết 1 hóa đơn)

**Endpoint:** `GET /invoices/:invoicePublicId/details`  
**Auth:** ✅ Required  
**Returns:** Array với 1 phần tử (Invoice + Details)

#### Request
```http
GET /invoices/inv-uuid-001/details
Authorization: Bearer {token}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T10:40:00Z",
  "message": "Get detail success.",
  "data": [
    {
      "publicId": "inv-uuid-001",
      "invoiceSymbol": "C1/21A-001",
      "isB2C": true,
      "status": "ISSUED",
      "totalPayment": 5500000,
      "paidAmount": 0,
      "remainingAmount": 5500000,
      "taxPayable": 500000,
      "details": [
        {
          "id": 1,
          "productNameSnapshot": "Điều hòa LG",
          "quantity": 5,
          "unitPrice": 500000,
          "totalAmount": 2500000,
          "productPublicId": "prod-uuid-001",
          "unit": "cái",
          "productType": "FINISHED_GOOD"
        },
        {
          "id": 2,
          "productNameSnapshot": "Máy giặt Samsung",
          "quantity": 2,
          "unitPrice": 1500000,
          "totalAmount": 3000000,
          "productPublicId": "prod-uuid-002",
          "unit": "cái",
          "productType": "FINISHED_GOOD"
        }
      ]
    }
  ],
  "meta": null
}
```

**Lưu ý:** Response trả về `data` là **array** (chứa 1 phần tử), không phải object đơn lẻ.

---

### 4. Update Invoice (Cập nhật hóa đơn)

**Endpoint:** `PATCH /invoices/:invoicePublicId`  
**Auth:** ✅ Required  
**Period Lock:** ✅ Checked  
**Allowed Status:** `DRAFT`, `SYNC_FAILED`  
**Returns:** `200 OK`

#### Request Body
```json
{
  "isB2C": false,
  "buyerName": "Công ty XYZ",
  "buyerTaxCode": "0123456789",
  "paymentMethod": "BANK",
  "details": [
    {
      "productPublicId": "prod-uuid-001",
      "quantity": 10
    }
  ]
}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T10:45:00Z",
  "message": "Invoice updated successfully.",
  "data": {
    "publicId": "inv-uuid-001",
    "invoiceSymbol": "C1/21A-001",
    "isB2C": false,
    "buyerName": "Công ty XYZ",
    "buyerTaxCode": "0123456789",
    "status": "DRAFT",
    "totalPayment": 11000000,
    "paymentMethod": "BANK",
    "details": [
      {
        "id": 3,
        "productNameSnapshot": "Điều hòa LG",
        "quantity": 10,
        "unitPrice": 500000,
        "totalAmount": 5000000,
        "productPublicId": "prod-uuid-001",
        "unit": "cái"
      }
    ]
  },
  "meta": null
}
```

#### Error Cases
```json
// 403: Invoice locked (ISSUED/CANCELED)
{
  "success": false,
  "statusCode": 403,
  "message": "Cannot update locked invoice",
  "data": null,
  "meta": null
}

// 409: Insufficient stock
{
  "success": false,
  "statusCode": 409,
  "message": "Product stock is insufficient",
  "data": null,
  "meta": null
}
```

---

### 5. Publish Invoice (Phát hành & Xin mã CQT)

**Endpoint:** `POST /invoices/:invoicePublicId/publish`  
**Auth:** ✅ Required  
**Period Lock:** ✅ Checked  
**Allowed Status:** `DRAFT`, `SYNC_FAILED`  
**Returns:** `201 Created`

#### Request
```http
POST /invoices/inv-uuid-001/publish
Authorization: Bearer {token}
```

**Body:** None (empty body)

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-05-28T11:00:00Z",
  "message": "Complete the process of calling the tax authority for the code.",
  "data": {
    "publicId": "inv-uuid-001",
    "invoiceSymbol": "C1/21A-001",
    "status": "ISSUED",
    "cqtCode": "2021-001-001",
    "totalPayment": 5500000,
    "taxPayable": 500000,
    "details": [
      // ... details array
    ]
  },
  "meta": null
}
```

#### Response (Temporary Failure - SYNC_FAILED)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-05-28T11:00:30Z",
  "message": "Complete the process of calling the tax authority for the code.",
  "data": {
    "publicId": "inv-uuid-001",
    "invoiceSymbol": "C1/21A-001",
    "status": "SYNC_FAILED",
    "cqtCode": null,
    "totalPayment": 5500000,
    "details": [
      // ... details array
    ]
  },
  "meta": null
}
```

#### Error Cases
```json
// 409: Insufficient stock
{
  "success": false,
  "statusCode": 409,
  "message": "Not enough stock to publish invoice",
  "data": {
    "productPublicId": "prod-uuid-001",
    "required": 10,
    "available": 5
  },
  "meta": null
}

// 403: Cannot publish (wrong status)
{
  "success": false,
  "statusCode": 403,
  "message": "Cannot publish invoice with status ISSUED",
  "data": null,
  "meta": null
}

// 504: CQT API timeout
{
  "success": false,
  "statusCode": 504,
  "message": "Tax authority request timeout. Invoice marked as SYNC_FAILED. Please retry.",
  "data": null,
  "meta": null
}
```

**Handling Publish Timeout:**
1. Frontend nhận `SYNC_FAILED` → invoice quay lại `SYNC_FAILED` (tồn kho được hoàn)
2. Hiển thị notification: "Hóa đơn chưa được phát hành. Vui lòng thử lại."
3. User click "Retry Publish" → gọi `/publish` lại
4. Hệ thống tự động reconcile cache với BE

---

### 6. Cancel Invoice (Huỷ hóa đơn)

**Endpoint:** `PATCH /invoices/:invoicePublicId/cancel`  
**Auth:** ✅ Required  
**Period Lock:** ✅ Checked  
**Allowed Status:** `ISSUED` chỉ  
**Returns:** `200 OK`

#### Request Body
```json
{
  "cancellationReason": "Khách yêu cầu huỷ"
}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T11:30:00Z",
  "message": "Invoice canceled success.",
  "data": {
    "publicId": "inv-uuid-001",
    "invoiceSymbol": "C1/21A-001",
    "status": "CANCELED",
    "cancellationReason": "Khách yêu cầu huỷ",
    "totalPayment": 5500000,
    "details": [
      // ... details array
    ]
  },
  "meta": null
}
```

#### Error Cases
```json
// 403: Can only cancel ISSUED invoices
{
  "success": false,
  "statusCode": 403,
  "message": "Can only cancel ISSUED invoices",
  "data": {
    "currentStatus": "DRAFT"
  },
  "meta": null
}

// 400: Reason required
{
  "success": false,
  "statusCode": 400,
  "message": "Cancellation reason is required",
  "data": null,
  "meta": null
}
```

---

### 7. Delete Invoice (Xoá DRAFT)

**Endpoint:** `DELETE /invoices/:invoicePublicId`  
**Auth:** ✅ Required  
**Period Lock:** ✅ Checked  
**Allowed Status:** `DRAFT` chỉ  
**Returns:** `200 OK`

#### Request
```http
DELETE /invoices/inv-uuid-001
Authorization: Bearer {token}
```

#### Response (Success)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T11:45:00Z",
  "message": "Invoice deleted successfully.",
  "data": null,
  "meta": null
}
```

#### Error Cases
```json
// 403: Can only delete DRAFT invoices
{
  "success": false,
  "statusCode": 403,
  "message": "Can only delete DRAFT invoices",
  "data": {
    "currentStatus": "ISSUED"
  },
  "meta": null
}
```

---

## 📨 Request/Response Examples

### Complete Flow: Tạo → Cập nhật → Phát hành → Huỷ

#### Step 1: Tạo hóa đơn DRAFT
```bash
curl -X POST http://localhost:3000/invoices \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "isB2C": true,
    "paymentMethod": "CASH",
    "details": [
      {"productPublicId": "prod-001", "quantity": 5}
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "publicId": "inv-001",
    "status": "DRAFT",
    "totalPayment": 2500000
  }
}
```

#### Step 2: Cập nhật thông tin (vẫn DRAFT)
```bash
curl -X PATCH http://localhost:3000/invoices/inv-001 \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "isB2C": false,
    "buyerName": "Công ty ABC",
    "buyerTaxCode": "0123456789"
  }'
```

#### Step 3: Phát hành (→ ISSUED)
```bash
curl -X POST http://localhost:3000/invoices/inv-001/publish \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "publicId": "inv-001",
    "status": "ISSUED",
    "cqtCode": "2021-001-001",
    "totalPayment": 2500000
  }
}
```

#### Step 4: Huỷ hóa đơn (→ CANCELED)
```bash
curl -X PATCH http://localhost:3000/invoices/inv-001/cancel \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "cancellationReason": "Khách yêu cầu huỷ"
  }'
```

---

## 🔄 Field Mapping Guide

### camelCase (Backend API) → snake_case (Frontend State)

Frontend cần mapping từ API response (camelCase) sang state (snake_case):

```typescript
// Backend DTO Response
{
  publicId: "inv-001",
  invoiceSymbol: "C1/21A-001",
  buyerName: "Công ty ABC",
  buyerTaxCode: "0123456789",
  buyerAddress: "123 Đường ABC",
  buyerEmail: "contact@abc.com",
  buyerIdNumber: "123456789",
  isB2C: false,
  status: "ISSUED",
  isPaid: false,
  totalPayment: 5500000,
  paidAmount: 0,
  remainingAmount: 5500000,
  cqtCode: "2021-001-001",
  paymentMethod: "BANK",
  taxRate: 10,
  taxPayable: 500000,
  cancellationReason: null,
  issueDate: "2026-05-28T00:00:00Z",
  createdAt: "2026-05-28T10:30:00Z",
  details: [...]
}

// Frontend Mapped State
{
  id: "inv-001",                    // publicId → id
  invoice_no: "C1/21A-001",         // invoiceSymbol → invoice_no
  customer_name: "Công ty ABC",     // buyerName → customer_name
  tax_code: "0123456789",           // buyerTaxCode → tax_code
  address: "123 Đường ABC",         // buyerAddress → address
  email: "contact@abc.com",         // buyerEmail → email
  id_number: "123456789",           // buyerIdNumber → id_number
  is_b2c: false,                    // isB2C → is_b2c
  status: "ISSUED",
  is_paid: false,                   // isPaid → is_paid
  total_amount: 5500000,            // totalPayment → total_amount
  paid_amount: 0,                   // paidAmount → paid_amount
  remaining_amount: 5500000,        // remainingAmount → remaining_amount
  cqt_code: "2021-001-001",         // cqtCode → cqt_code
  payment_method: "BANK",           // paymentMethod → payment_method
  tax_rate: 10,                     // taxRate → tax_rate
  tax_payable: 500000,              // taxPayable → tax_payable
  cancellation_reason: null,        // cancellationReason → cancellation_reason
  issue_date: "2026-05-28T00:00:00Z", // issueDate → issue_date
  created_at: "2026-05-28T10:30:00Z", // createdAt → created_at
  details: [...]
}
```

### Mapper Implementation (TypeScript)

```typescript
// src/services/invoice.mapper.ts

export function mapInvoiceDTOToFE(dto: InvoiceResponseDTO): Invoice {
  return {
    id: dto.publicId,
    invoice_no: dto.invoiceSymbol,
    customer_name: dto.buyerName || undefined,
    tax_code: dto.buyerTaxCode || undefined,
    address: dto.buyerAddress || undefined,
    email: dto.buyerEmail || undefined,
    id_number: dto.buyerIdNumber || undefined,
    is_b2c: dto.isB2C,
    status: dto.status,
    is_paid: dto.isPaid,
    total_amount: Number(dto.totalPayment) || 0,
    paid_amount: Number(dto.paidAmount) || 0,
    remaining_amount: Number(dto.remainingAmount) || 0,
    cqt_code: dto.cqtCode || undefined,
    payment_method: dto.paymentMethod,
    tax_rate: Number(dto.taxRate) || 0,
    tax_payable: Number(dto.taxPayable) || 0,
    cancellation_reason: dto.cancellationReason || undefined,
    issue_date: dto.issueDate,
    created_at: dto.createdAt,
    details: (dto.details || []).map(detail => ({
      id: detail.id,
      product_name: detail.productNameSnapshot,
      quantity: Number(detail.quantity) || 0,
      unit_price: Number(detail.unitPrice) || 0,
      total_amount: Number(detail.totalAmount) || 0,
      product_id: detail.productPublicId,
      unit: detail.unit,
      product_type: detail.productType
    }))
  };
}

// Reverse mapping untuk create/update request
export function mapInvoiceFormToCreateDTO(values: any): CreateInvoiceRequestDTO {
  return {
    isB2C: values.is_b2c ?? null,
    buyerName: values.customer_name || null,
    buyerTaxCode: values.tax_code || null,
    buyerAddress: values.address || null,
    buyerEmail: values.email || null,
    buyerIdNumber: values.id_number || null,
    paymentMethod: values.payment_method,
    details: (values.details || []).map((d: any) => ({
      productPublicId: d.product_id,
      quantity: Number(d.quantity) || 0
    }))
  };
}
```

---

## ⚠️ Error Handling

### Standard Error Response

Tất cả lỗi đều trả về format:

```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-05-28T11:50:00Z",
  "message": "Error description",
  "data": null,
  "meta": null
}
```

### HTTP Status Codes

| Code | Meaning | Hành động FE |
|------|---------|-------------|
| 400 | Bad Request | Hiển thị validation error |
| 401 | Unauthorized | Redirect tới login |
| 403 | Forbidden | Hiển thị "Bạn không có quyền" |
| 404 | Not Found | Hiển thị "Hóa đơn không tồn tại" |
| 409 | Conflict | Hiển thị "Tồn kho không đủ" |
| 423 | Locked | Hiển thị "Kỳ kế toán đã chốt" |
| 504 | Gateway Timeout | Hiển thị "Kết nối CQT timeout, vui lòng thử lại" |
| 500 | Internal Server Error | Hiển thị generic error + contact support |

### Frontend Error Handling Pattern

```typescript
// src/services/api.service.ts

export async function apiCallWithRetry(
  endpoint: string,
  options: RequestInit,
  maxRetries = 3
) {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, options);
      
      if (!response.ok) {
        const error = await response.json();
        
        // 401 → redirect login
        if (response.status === 401) {
          window.location.href = '/login';
          throw new Error('Unauthorized');
        }
        
        // 423 → period locked
        if (response.status === 423) {
          throw new Error('Financial period is locked');
        }
        
        // 504 → retry
        if (response.status === 504 && attempt < maxRetries) {
          lastError = error;
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        
        throw error;
      }
      
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  throw lastError;
}
```

---

## 🔗 Integration Flow

### Flow 1: Fetch & Display Invoices

```
Frontend                              Backend
   │                                    │
   ├─ GET /invoices?page=1 ─────────→ │
   │                             ┌─ Check JWT
   │                             ├─ Query DB (user_id = current_user)
   │                             └─ Map to DTO
   │                                    │
   │ ← 200 + List[InvoiceDTO] ────────┤
   │                                    │
   ├─ Map API response to FE state     │
   ├─ Update store (invoices list)     │
   └─ Render UI                        │
```

### Flow 2: Create Invoice

```
Frontend                              Backend
   │                                    │
   ├─ Form input (customer, items)     │
   ├─ Validate locally                 │
   ├─ POST /invoices + request ────→  │
   │                             ┌─ Check JWT
   │                             ├─ Validate B2C/B2B info
   │                             ├─ Pre-flight: Check stock
   │                             ├─ TX: Create Invoice + Details
   │                             ├─ Map to DTO
   │                             └─ Return status DRAFT
   │                                    │
   │ ← 201 + InvoiceDTO ───────────────┤
   │                                    │
   ├─ Map response to FE state        │
   ├─ Merge into cache                │
   ├─ Navigate to invoice detail      │
   └─ Show toast "Created"            │
```

### Flow 3: Publish Invoice (Xin mã CQT)

```
Frontend                              Backend
   │                                    │
   ├─ Click "Publish" btn             │
   ├─ POST /invoices/inv-001/publish ─→│
   │                             ┌─ Check JWT
   │                             ├─ Check status = DRAFT or SYNC_FAILED
   │                             ├─ Pre-flight: Check stock again
   │                             ├─ TX Phase 1: Set status → PENDING_ISSUED
   │                             ├─ TX Phase 1: Decrement stock (Optimistic Lock)
   │                             ├─ EX Phase 2: Call Tax Authority API
   │                             │
   │                        ┌─ Success ──────────────────────────┐
   │                        │                                    │
   │                    Phase 3a:                           Phase 3b:
   │                    ✅ Success                         ❌ Failed
   │                    │                                  │
   │                    ├─ TX: status → ISSUED            ├─ TX: status → SYNC_FAILED
   │                    ├─ TX: Assign cqtCode             ├─ TX: Restore stock
   │                    ├─ TX: Add revenue                ├─ Audit log
   │                    ├─ Audit log                      │
   │                    │                                  │
   │ ← 201 + {status: ISSUED, cqtCode} ──────────────────────┤
   │                                                           │
   │ (Map response)                                            │
   │ ├─ If ISSUED: Show cqtCode badge, disable edit         │
   │ ├─ If SYNC_FAILED: Show "Retry" button, enable edit    │
   │ └─ Add to revenue book cache                           │
```

### Flow 4: Cancel Invoice

```
Frontend                              Backend
   │                                    │
   ├─ Click "Cancel" btn              │
   ├─ Prompt: "Lý do huỷ?"            │
   ├─ PATCH /invoices/inv-001/cancel ─→│
   │                             ┌─ Check JWT
   │                             ├─ Check status = ISSUED
   │                             ├─ TX: status → CANCELED
   │                             ├─ TX: Restore stock
   │                             ├─ TX: Cancel linked vouchers
   │                             ├─ TX: Subtract from revenue
   │                             ├─ Audit log
   │                                    │
   │ ← 200 + {status: CANCELED} ───────┤
   │                                    │
   ├─ Update store                     │
   ├─ Refresh revenue book cache       │
   └─ Show toast "Canceled"            │
```

---

## ✅ Testing Checklist

### Unit Tests (Service Layer)

- [ ] Create invoice with B2C customer
- [ ] Create invoice with B2B customer → validate tax code, name
- [ ] Create invoice → check stock insufficient → 409 error
- [ ] Create invoice → validate price snapshot saved
- [ ] Create invoice → check cache entry created
- [ ] Update DRAFT invoice → modify customer info
- [ ] Update DRAFT invoice → modify line items
- [ ] Cannot update ISSUED invoice → 403 error
- [ ] Cannot update invoice outside period → 423 error
- [ ] Publish DRAFT invoice → transition to ISSUED, stock decreased, revenue increased
- [ ] Publish with insufficient stock → 409 error, status stays DRAFT
- [ ] Publish timeout → status = SYNC_FAILED, stock restored
- [ ] Publish SYNC_FAILED (retry) → retry successfully becomes ISSUED
- [ ] Cancel ISSUED invoice → status = CANCELED, stock restored, revenue decreased
- [ ] Cannot cancel DRAFT invoice → 403 error
- [ ] Cannot delete ISSUED invoice → 403 error
- [ ] Delete DRAFT invoice → hard delete from DB

### Integration Tests (API + DB)

- [ ] CREATE + GET = data consistency
- [ ] CREATE + UPDATE + GET = reflect all changes
- [ ] Publish flow: DRAFT → PENDING_ISSUED → ISSUED (check CQT mock call)
- [ ] Publish timeout handling: Mark as SYNC_FAILED, stock roll back
- [ ] Retry publish: SYNC_FAILED → ISSUED (2nd attempt succeeds)
- [ ] Cancel: ISSUED → CANCELED, vouchers auto-canceled
- [ ] Concurrent publishes: Only one succeeds (Optimistic Lock)
- [ ] Concurrent cancels: Only one succeeds

### Manual (UI/Frontend)

- [ ] Load invoices list, filter by status
- [ ] Create DRAFT, see it in list immediately
- [ ] Edit DRAFT, refresh page → still see changes (cache merge)
- [ ] Publish DRAFT → see status badge change to "ISSUED"
- [ ] See CQT code in detail view after publish
- [ ] Publish timeout → UI shows "Retry" button
- [ ] Click Retry → successfully publishes
- [ ] Cancel ISSUED → prompt for reason, confirm action
- [ ] After cancel → status = "CANCELED", revenue updates
- [ ] Delete DRAFT → removed from list immediately
- [ ] Period lock: Try to create/publish → show "Kỳ kế toán đã chốt"
- [ ] Session timeout → redirect to login when trying API call
- [ ] Test on different browsers (Chrome, Firefox, Safari)

### Edge Cases

- [ ] Very large quantity (10,000+ units)
- [ ] Very large amount (1 billion+)
- [ ] Empty details array → 400 error
- [ ] Duplicate product in same invoice
- [ ] Missing required fields (buyerName for B2B)
- [ ] Invalid email format
- [ ] Cancel reason with special characters
- [ ] Network disconnection during publish
- [ ] Browser tab closed during publish

---

## 🔗 Related Documentation

- **Backend README:** `src/invoices/README.md`
- **API Models:** `docs/API_RESPONSE_MODELS.md` (Section 2)
- **Frontend Plan:** `docs-coding-guidelines/plan_api_outboundInvoice.md`
- **Architecture Guide:** `CONTRIBUTE.md`
- **Product API:** `docs/API_RESPONSE_MODELS.md` (Section 1)

---

## 📞 Support & Questions

- **Issues with API response?** → Check this doc's "Data Models" section
- **Field mapping confusion?** → See "Field Mapping Guide"
- **Error codes not clear?** → Check "Error Handling" section
- **Integration flow unclear?** → Review "Integration Flow" diagrams
- **Still stuck?** → Contact Backend Team or open GitHub Issue

---

**Document Status:** ✅ Approved for Integration  
**Last Reviewed:** 2026-05-28  
**Maintained By:** Backend Team
