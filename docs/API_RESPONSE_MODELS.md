# API Endpoints & Data Models Documentation

This document describes the request and response data structures of the core API endpoints. Responses use the global application wrapper structure. The values inside the JSON structures denote the **data types** rather than example data.

## Table of Contents

- [1. Products](#1-products)
  - [1.1. Create Product](#11-create-product)
  - [1.2. Get All Products](#12-get-all-products)
  - [1.3. Get Product Details](#13-get-product-details)
  - [1.4. Update Product](#14-update-product)
  - [1.5. Delete Product](#15-delete-product)
  - [1.6. Get Product Summary](#16-get-product-summary)
- [2. Invoices (Outbound)](#2-invoices-outbound)
  - [2.1. Create Invoice](#21-create-invoice)
  - [2.2. Publish Invoice (Request Tax Code)](#22-publish-invoice-request-tax-code)
  - [2.3. Get All Invoices](#23-get-all-invoices)
  - [2.4. Get Invoice Details](#24-get-invoice-details)
  - [2.5. Cancel Invoice](#25-cancel-invoice)
  - [2.6. Update Invoice](#26-update-invoice)
  - [2.7. Delete Invoice](#27-delete-invoice)
  - [2.8. Get Outbound Invoice Summary](#28-get-outbound-invoice-summary)
- [3. Inbound Invoices](#3-inbound-invoices)
  - [3.1. Create Inbound Invoice](#31-create-inbound-invoice)
  - [3.2. Get All Inbound Invoices](#32-get-all-inbound-invoices)
  - [3.3. Get Inbound Invoice Details](#33-get-inbound-invoice-details)
  - [3.4. Cancel Inbound Invoice](#34-cancel-inbound-invoice)
  - [3.5. Sync Inbound Invoice to Inventory](#35-sync-inbound-invoice-to-inventory)
  - [3.6. Update Inbound Invoice](#36-update-inbound-invoice)
  - [3.7. Delete Inbound Invoice](#37-delete-inbound-invoice)
- [4. Vouchers (Receipts/Payments)](#4-vouchers-receiptspayments)
  - [4.1. Create Voucher](#41-create-voucher)
  - [4.2. Get All Vouchers](#42-get-all-vouchers)
  - [4.3. Get Voucher Details](#43-get-voucher-details)
  - [4.4. Update Voucher](#44-update-voucher)
  - [4.5. Cancel Voucher](#45-cancel-voucher)
- [5. Voucher Categories](#5-voucher-categories)
  - [5.1. Create Voucher Category](#51-create-voucher-category)
  - [5.2. Get All Voucher Categories](#52-get-all-voucher-categories)
  - [5.3. Update Voucher Category](#53-update-voucher-category)
  - [5.4. Delete Voucher Category](#54-delete-voucher-category)
- [6. Auth](#6-auth)
  - [6.1. Register](#61-register)
  - [6.2. Login](#62-login)
  - [6.3. Get Profile](#63-get-profile)
  - [6.4. Refresh Token](#64-refresh-token)
  - [6.5. Logout](#65-logout)
- [7. Onboarding](#7-onboarding)
  - [7.1. Get Onboarding Init Data](#71-get-onboarding-init-data)
  - [7.2. Setup Tax Configuration](#72-setup-tax-configuration)
  - [7.3. Update Tax Configuration](#73-update-tax-configuration)
- [8. Users](#8-users)
  - [8.1. Update User Profile](#81-update-user-profile)
- [9. Dashboard](#9-dashboard)
  - [9.1. Get Dashboard Summary](#91-get-dashboard-summary)
- [10. Financial Periods](#10-financial-periods)
  - [10.1. Reopen Financial Period](#101-reopen-financial-period)
  - [10.2. Confirm Tax Payment](#102-confirm-tax-payment)
  - [10.3. Compare PIT](#103-compare-pit)
- [11. Internal Production Orders](#11-internal-production-orders)
  - [11.1. Create Production Order](#111-create-production-order)
  - [11.2. Cancel Production Order](#112-cancel-production-order)
  - [11.3. Get All Production Orders](#113-get-all-production-orders)
- [12. Tax Declaration](#12-tax-declaration)
  - [12.1. Init Tax Declaration](#121-init-tax-declaration)
  - [12.2. Start Session](#122-start-session)
  - [12.3. Get Step 1](#123-get-step-1)
  - [12.4. Save Step 1](#124-save-step-1)
  - [12.5. Get Step 2](#125-get-step-2)
  - [12.6. Save Step 2](#126-save-step-2)
  - [12.7. Get Step 3](#127-get-step-3)
  - [12.8. Save Step 3](#128-save-step-3)
  - [12.9. Get Step 4](#129-get-step-4)
  - [12.10. Save Step 4](#1210-save-step-4)
  - [12.11. Step 5 Preview](#1211-step-5-preview)
  - [12.12. Submit Declaration](#1212-submit-declaration)
  - [12.13. Submit Force](#1213-submit-force)
  - [12.14. Submit Ignore Warning](#1214-submit-ignore-warning)
- [13. Accounting Books](#13-accounting-books)
  - [13.1. Get Revenue Book Summary](#131-get-revenue-book-summary)
  - [13.2. Get Revenue Book Records](#132-get-revenue-book-records)
  - [13.3. Get Cash Flow Book Summary](#133-get-cash-flow-book-summary)
  - [13.4. Get Cash Flow Book Records](#134-get-cash-flow-book-records)
  - [13.5. Get Expense Book Summary](#135-get-expense-book-summary)
  - [13.6. Get Expense Book Records](#136-get-expense-book-records)
  - [13.7. Get Inventory Book Summary](#137-get-inventory-book-summary)
  - [13.8. Get Inventory Book Records](#138-get-inventory-book-records)

---

## 1. Products

### 1.1. Create Product

- **Route:** `/products`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)
- **Content-Type:** `multipart/form-data`

#### Request Body

```json
{
  "file": "Binary File (Image) - Optional",
  "productName": "string",
  "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\"",
  "skuCode": "string (Optional)",
  "unit": "string",
  "sellingPrice": "number",
  "openingStockQuantity": "number",
  "openingStockUnitCost": "number"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Product created successfully.",
  "data": {
    "publicId": "string",
    "skuCode": "string",
    "productName": "string",
    "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\"",
    "unit": "string",
    "imageUrl": "string",
    "currentStock": "number",
    "openingStockQuantity": "number",
    "sellingPrice": "number",
    "openingStockUnitCost": "number",
    "openingStockValue": "number",
    "createdAt": "Date string"
  },
  "meta": null
}
```

### 1.2. Get All Products

- **Route:** `/products`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `productType`: `"FINISHED_GOOD" | "RAW_MATERIAL" | "SERVICE" (Optional) (Backend also tolerates common spelling variations like "FINISH_GOOD" or "RAW_METARIAL")`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Products retrieved successfully.",
  "data": [
    {
      "publicId": "string",
      "skuCode": "string",
      "productName": "string",
      "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\"",
      "unit": "string",
      "imageUrl": "string",
      "currentStock": "number",
      "openingStockQuantity": "number",
      "sellingPrice": "number",
      "openingStockUnitCost": "number",
      "openingStockValue": "number",
      "createdAt": "Date string"
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "lastPage": "number"
  }
}
```

### 1.3. Get Product Details

- **Route:** `/products/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Product retrieved successfully.",
  "data": {
    "publicId": "string",
    "skuCode": "string",
    "productName": "string",
    "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\"",
    "unit": "string",
    "imageUrl": "string",
    "currentStock": "number",
    "openingStockQuantity": "number",
    "sellingPrice": "number",
    "openingStockUnitCost": "number",
    "openingStockValue": "number",
    "createdAt": "Date string"
  },
  "meta": null
}
```

### 1.4. Update Product

- **Route:** `/products/:publicId`
- **Method:** `PUT`
- **Authentication:** Required (Bearer Token in Authorization Header)
- **Content-Type:** `multipart/form-data`

#### Request Body

```json
{
  "file": "Binary File (Image) - Optional",
  "productName": "string (Optional)",
  "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\" (Optional)",
  "skuCode": "string (Optional)",
  "unit": "string (Optional)",
  "sellingPrice": "number (Optional)",
  "openingStockQuantity": "number (Optional)",
  "openingStockUnitCost": "number (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Product updated successfully.",
  "data": {
    "publicId": "string",
    "skuCode": "string",
    "productName": "string",
    "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\"",
    "unit": "string",
    "imageUrl": "string",
    "currentStock": "number",
    "openingStockQuantity": "number",
    "sellingPrice": "number",
    "openingStockUnitCost": "number",
    "openingStockValue": "number",
    "createdAt": "Date string"
  },
  "meta": null
}
```

### 1.5. Delete Product

- **Route:** `/products/:publicId`
- **Method:** `DELETE`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Product deleted successfully.",
  "data": null,
  "meta": null
}
```

### 1.6. Get Product Summary

- **Route:** `/products/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

None

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Product summary retrieved successfully.",
  "data": {
    "tong_san_pham": "number",
    "tong_san_pham_phan_loai": {
      "FINISHED_GOOD": "number",
      "RAW_MATERIAL": "number",
      "SERVICE": "number"
    },
    "tong_gia_tri_ton_kho": "number",
    "sap_het_hang": "number"
  },
  "meta": null
}
```

---

## 2. Invoices (Outbound)

### 2.1. Create Invoice

- **Route:** `/invoices`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "isB2C": "boolean (Optional)",
  "buyerName": "string (Optional)",
  "buyerTaxCode": "string (Optional)",
  "buyerAddress": "string (Optional)",
  "buyerEmail": "string (Optional)",
  "buyerIdNumber": "string (Optional)",
  "paymentMethod": "\"CASH\" | \"BANK\"",
  "details": [
    {
      "productPublicId": "string",
      "quantity": "number"
    }
  ]
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Invoice created successfully.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string | null",
    "buyerTaxCode": "string | null",
    "buyerAddress": "string | null",
    "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string | null",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "buyerEmail": "string | null",
    "buyerIdNumber": "string | null",
    "taxRate": "number",
    "taxPayable": "number",
    "cancellationReason": "string | null",
    "issueDate": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string",
        "unit": "string",
        "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
      }
    ]
  },
  "meta": null
}
```

### 2.2. Publish Invoice (Request Tax Code)

- **Route:** `/invoices/:id/publish`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Complete the process of calling the tax authority for the code.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string | null",
    "buyerTaxCode": "string | null",
    "buyerAddress": "string | null",
    "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string | null",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "buyerEmail": "string | null",
    "buyerIdNumber": "string | null",
    "taxRate": "number",
    "taxPayable": "number",
    "cancellationReason": "string | null",
    "issueDate": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string",
        "unit": "string",
        "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
      }
    ]
  },
  "meta": null
}
```

### 2.3. Get All Invoices

- **Route:** `/invoices`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `status`: `string (Optional) - Options: "DRAFT" / "BAN_NHAP" / "BẢN NHÁP", "ISSUED" / "DA_PHAT_HANH" / "ĐÃ PHÁT HÀNH", "SYNC_FAILED" / "LOI_DONG_BO" / "LỖI ĐỒNG BỘ", "CANCELED" / "DA_HUY" / "ĐÃ HỦY" (case-insensitive)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Get all invoice own success",
  "data": [
    {
      "publicId": "string",
      "invoiceSymbol": "string",
      "isB2C": "boolean",
      "buyerName": "string | null",
      "buyerTaxCode": "string | null",
      "buyerAddress": "string | null",
      "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
      "isPaid": "boolean",
      "totalPayment": "number",
      "paidAmount": "number",
      "remainingAmount": "number",
      "cqtCode": "string | null",
      "paymentMethod": "\"CASH\" | \"BANK\"",
      "buyerEmail": "string | null",
      "buyerIdNumber": "string | null",
      "taxRate": "number",
      "taxPayable": "number",
      "cancellationReason": "string | null",
      "issueDate": "Date string",
      "createdAt": "Date string",
      "details": [
        {
          "id": "number",
          "productNameSnapshot": "string",
          "quantity": "number",
          "unitPrice": "number",
          "totalAmount": "number",
          "productPublicId": "string",
          "unit": "string",
          "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
        }
      ]
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "lastPage": "number"
  }
}
```

### 2.4. Get Invoice Details

- **Route:** `/invoices/:invoicePublicId/details`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Get detail success.",
  "data": [
    {
      "publicId": "string",
      "invoiceSymbol": "string",
      "isB2C": "boolean",
      "buyerName": "string | null",
      "buyerTaxCode": "string | null",
      "buyerAddress": "string | null",
      "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
      "isPaid": "boolean",
      "totalPayment": "number",
      "paidAmount": "number",
      "remainingAmount": "number",
      "cqtCode": "string | null",
      "paymentMethod": "\"CASH\" | \"BANK\"",
      "buyerEmail": "string | null",
      "buyerIdNumber": "string | null",
      "taxRate": "number",
      "taxPayable": "number",
      "cancellationReason": "string | null",
      "issueDate": "Date string",
      "createdAt": "Date string",
      "details": [
        {
          "id": "number",
          "productNameSnapshot": "string",
          "quantity": "number",
          "unitPrice": "number",
          "totalAmount": "number",
          "productPublicId": "string",
          "unit": "string",
          "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
        }
      ]
    }
  ],
  "meta": null
}
```

_(Note: Service returns an array `response` for `detailInvoice` because `findMany` is used in Prisma, so `data` is an array containing the single invoice)._

### 2.5. Cancel Invoice

- **Route:** `/invoices/:invoicePublicId/cancel`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "cancellationReason": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Invoice canceled success.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string | null",
    "buyerTaxCode": "string | null",
    "buyerAddress": "string | null",
    "status": "\"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string | null",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "buyerEmail": "string | null",
    "buyerIdNumber": "string | null",
    "taxRate": "number",
    "taxPayable": "number",
    "cancellationReason": "string",
    "issueDate": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string",
        "unit": "string",
        "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
      }
    ]
  },
  "meta": null
}
```

### 2.6. Update Invoice

- **Route:** `/invoices/:invoicePublicId`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "isB2C": "boolean (Optional)",
  "buyerName": "string (Optional)",
  "buyerTaxCode": "string (Optional)",
  "buyerAddress": "string (Optional)",
  "buyerEmail": "string (Optional)",
  "buyerIdNumber": "string (Optional)",
  "paymentMethod": "\"CASH\" | \"BANK\" (Optional)",
  "details": [
    {
      "productPublicId": "string",
      "quantity": "number"
    }
  ] (Optional)
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Invoice updated successfully.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string | null",
    "buyerTaxCode": "string | null",
    "buyerAddress": "string | null",
    "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string | null",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "buyerEmail": "string | null",
    "buyerIdNumber": "string | null",
    "taxRate": "number",
    "taxPayable": "number",
    "cancellationReason": "string | null",
    "issueDate": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string",
        "unit": "string",
        "productType": "\"FINISHED_GOOD\" | \"RAW_MATERIAL\" | \"SERVICE\""
      }
    ]
  },
  "meta": null
}
```

### 2.7. Delete Invoice

- **Route:** `/invoices/:invoicePublicId`
- **Method:** `DELETE`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Invoice deleted successfully.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string | null",
    "buyerTaxCode": "string | null",
    "buyerAddress": "string | null",
    "status": "\"DRAFT\" | \"PENDING_ISSUED\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string | null",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "buyerEmail": "string | null",
    "buyerIdNumber": "string | null",
    "taxRate": "number",
    "taxPayable": "number",
    "cancellationReason": "string | null",
    "issueDate": "Date string",
    "createdAt": "Date string"
  },
  "meta": null
}
```

### 2.8. Get Outbound Invoice Summary

- **Route:** `/invoices/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

None

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Invoice summary retrieved successfully.",
  "data": {
    "tong_hoa_don": "number",
    "tong_doanh_thu": "number",
    "tong_thue": "number"
  },
  "meta": null
}
```

---

## 3. Inbound Invoices

### 3.1. Create Inbound Invoice

- **Route:** `/inbound-invoices`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "sellerName": "string",
  "sellerTaxCode": "string (Optional)",
  "invoiceNo": "string",
  "issueDate": "Date string",
  "attachmentUrl": "string (Optional)",
  "isSyncedToInventory": "boolean (Optional)",
  "items": [
    {
      "productPublicId": "string",
      "quantity": "number",
      "unitCost": "number"
    }
  ]
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Create success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "quantity": "number",
        "unitCost": "number",
        "lineTotal": "number",
        "productPublicId": "string",
        "productName": "string"
      }
    ]
  },
  "meta": null
}
```

### 3.2. Get All Inbound Invoices

- **Route:** `/inbound-invoices`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `type`: `"CHUA_DONG_BO" | "DA_NHAP_KHO" | "CHUA_THANH_TOAN" (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Get all inbound invoice success.",
  "data": [
    {
      "publicId": "string",
      "sellerName": "string",
      "sellerTaxCode": "string",
      "invoiceNo": "string",
      "issueDate": "Date string",
      "attachmentUrl": "string",
      "status": "\"ACTIVE\" | \"CANCELED\"",
      "isSyncedToInventory": "boolean",
      "isPaid": "boolean",
      "totalAmount": "number",
      "paidAmount": "number",
      "remainingAmount": "number",
      "createdAt": "Date string",
      "details": [
        {
          "id": "number",
          "quantity": "number",
          "unitCost": "number",
          "lineTotal": "number",
          "productPublicId": "string",
          "productName": "string"
        }
      ]
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "lastPage": "number"
  }
}
```

### 3.3. Get Inbound Invoice Details

- **Route:** `/inbound-invoices/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Get detail inbound invoice success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "quantity": "number",
        "unitCost": "number",
        "lineTotal": "number",
        "productPublicId": "string",
        "productName": "string"
      }
    ]
  },
  "meta": null
}
```

### 3.4. Cancel Inbound Invoice

- **Route:** `/inbound-invoices/:publicId/cancel`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Cancel inbound invoice success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string",
    "attachmentUrl": "string",
    "status": "\"CANCELED\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "quantity": "number",
        "unitCost": "number",
        "lineTotal": "number",
        "productPublicId": "string",
        "productName": "string"
      }
    ]
  },
  "meta": null
}
```

### 3.5. Sync Inbound Invoice to Inventory

- **Route:** `/inbound-invoices/:publicId/sync-inventory`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Sync to inventory success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "quantity": "number",
        "unitCost": "number",
        "lineTotal": "number",
        "productPublicId": "string",
        "productName": "string"
      }
    ]
  },
  "meta": null
}
```

### 3.6. Update Inbound Invoice

- **Route:** `/inbound-invoices/:publicId`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "sellerName": "string (Optional)",
  "sellerTaxCode": "string (Optional)",
  "invoiceNo": "string (Optional)",
  "issueDate": "Date string (Optional)",
  "attachmentUrl": "string (Optional)",
  "isSyncedToInventory": "boolean (Optional)",
  "items": [
    {
      "productPublicId": "string",
      "quantity": "number",
      "unitCost": "number"
    }
  ] (Optional)
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Update success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "quantity": "number",
        "unitCost": "number",
        "lineTotal": "number",
        "productPublicId": "string",
        "productName": "string"
      }
    ]
  },
  "meta": null
}
```

### 3.7. Delete Inbound Invoice

- **Route:** `/inbound-invoices/:publicId`
- **Method:** `DELETE`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Inbound invoice deleted successfully.",
  "data": null,
  "meta": null
}
```

---

## 4. Vouchers (Receipts/Payments)

### 4.1. Create Voucher

- **Route:** `/vouchers`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
  "categoryId": "number",
  "content": "string",
  "amount": "number",
  "paymentMethod": "\"CASH\" | \"BANK\"",
  "isDeductibleExpense": "boolean (Optional)",
  "inboundInvoicePublicId": "string (Optional)",
  "outboundInvoicePublicId": "string (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Voucher created successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "amount": "number",
    "createdAt": "Date string",
    "category": {
      "id": "number",
      "categoryName": "string",
      "type": "\"RECEIPT\" | \"PAYMENT\"",
      "isSystemDefault": "boolean"
    },
    "inboundInvoicePublicId": "string",
    "inboundInvoiceNo": "string",
    "outboundInvoicePublicId": "string",
    "outboundInvoiceSymbol": "string"
  },
  "meta": null
}
```

### 4.2. Get All Vouchers

- **Route:** `/vouchers`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `page`: `number (Optional)`
- `limit`: `number (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Vouchers retrieved successfully",
  "data": [
    {
      "voucherCode": "string",
      "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
      "transactionAt": "Date string",
      "content": "string",
      "paymentMethod": "\"CASH\" | \"BANK\"",
      "isDeductibleExpense": "boolean",
      "status": "\"ACTIVE\" | \"CANCELED\"",
      "amount": "number",
      "createdAt": "Date string",
      "category": {
        "id": "number",
        "categoryName": "string",
        "type": "\"RECEIPT\" | \"PAYMENT\"",
        "isSystemDefault": "boolean"
      },
      "inboundInvoicePublicId": "string",
      "inboundInvoiceNo": "string",
      "outboundInvoicePublicId": "string",
      "outboundInvoiceSymbol": "string"
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "lastPage": "number"
  }
}
```

### 4.3. Get Voucher Details

- **Route:** `/vouchers/:orderCode`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher details retrieved successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "amount": "number",
    "createdAt": "Date string",
    "category": {
      "id": "number",
      "categoryName": "string",
      "type": "\"RECEIPT\" | \"PAYMENT\"",
      "isSystemDefault": "boolean"
    },
    "inboundInvoicePublicId": "string",
    "inboundInvoiceNo": "string",
    "outboundInvoicePublicId": "string",
    "outboundInvoiceSymbol": "string"
  },
  "meta": null
}
```

### 4.4. Update Voucher

- **Route:** `/vouchers/:voucherCode`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "categoryId": "number (Optional)",
  "content": "string (Optional)",
  "paymentMethod": "\"CASH\" | \"BANK\" (Optional)",
  "isDeductibleExpense": "boolean (Optional)"
}
```

_(Note: Fields like `voucherType`, `amount`, and `invoicePublicId` cannot be updated)._

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher updated successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "amount": "number",
    "createdAt": "Date string",
    "category": {
      "id": "number",
      "categoryName": "string",
      "type": "\"RECEIPT\" | \"PAYMENT\"",
      "isSystemDefault": "boolean"
    },
    "inboundInvoicePublicId": "string",
    "inboundInvoiceNo": "string",
    "outboundInvoicePublicId": "string",
    "outboundInvoiceSymbol": "string"
  },
  "meta": null
}
```

### 4.5. Cancel Voucher

- **Route:** `/vouchers/:voucherCode/cancel`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher canceled successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"CANCELED\"",
    "amount": "number",
    "createdAt": "Date string",
    "category": {
      "id": "number",
      "categoryName": "string",
      "type": "\"RECEIPT\" | \"PAYMENT\"",
      "isSystemDefault": "boolean"
    },
    "inboundInvoicePublicId": "string",
    "inboundInvoiceNo": "string",
    "outboundInvoicePublicId": "string",
    "outboundInvoiceSymbol": "string"
  },
  "meta": null
}
```

---

## 5. Voucher Categories

### 5.1. Create Voucher Category

- **Route:** `/voucher-categories`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "type": "\"RECEIPT\" | \"PAYMENT\"",
  "categoryName": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Voucher category created successfully",
  "data": {
    "id": "number",
    "categoryName": "string",
    "type": "\"RECEIPT\" | \"PAYMENT\"",
    "isSystemDefault": "boolean"
  },
  "meta": null
}
```

### 5.2. Get All Voucher Categories

- **Route:** `/voucher-categories`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher categories retrieved successfully",
  "data": [
    {
      "id": "number",
      "categoryName": "string",
      "type": "\"RECEIPT\" | \"PAYMENT\"",
      "isSystemDefault": "boolean"
    }
  ],
  "meta": null
}
```

### 5.3. Update Voucher Category

- **Route:** `/voucher-categories/:id`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "type": "\"RECEIPT\" | \"PAYMENT\" (Optional)",
  "categoryName": "string (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher category updated successfully",
  "data": {
    "id": "number",
    "categoryName": "string",
    "type": "\"RECEIPT\" | \"PAYMENT\"",
    "isSystemDefault": "boolean"
  },
  "meta": null
}
```

### 5.4. Delete Voucher Category

- **Route:** `/voucher-categories/:id`
- **Method:** `DELETE`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Voucher category deleted successfully",
  "data": null,
  "meta": null
}
```

---

## 6. Auth

### 6.1. Register

- **Route:** `/auth/register`
- **Method:** `POST`
- **Authentication:** None

#### Request Body (JSON)

```json
{
  "phoneNumber": "string",
  "password": "string",
  "taxCode": "string",
  "businessName": "string",
  "ownerName": "string",
  "cccdNumber": "string",
  "provinceCity": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Register success",
  "data": {
    "id": "string",
    "phone": "string",
    "role": "\"ADMIN\" | \"STAFF\"",
    "tax_code": "string",
    "cccd_number": "string",
    "business_name": "string",
    "representative": "string",
    "industry": "string",
    "industry_label": "string",
    "tax_group": "number",
    "setUpCompletedAt": "Date string | null",
    "created_at": "Date string"
  },
  "meta": null
}
```

### 6.2. Login

- **Route:** `/auth/login`
- **Method:** `POST`
- **Authentication:** None

#### Request Body (JSON)

```json
{
  "phoneNumber": "string",
  "password": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Login success.",
  "data": {
    "user": {
      "id": "string",
      "phone": "string",
      "role": "\"ADMIN\" | \"STAFF\"",
      "tax_code": "string",
      "cccd_number": "string",
      "business_name": "string",
      "representative": "string",
      "industry": "string",
      "industry_label": "string",
      "tax_group": "number",
      "setUpCompletedAt": "Date string | null",
      "created_at": "Date string"
    },
    "accessToken": "string"
  },
  "meta": null
}
```

_(Note: `refresh_token` is returned securely via `Set-Cookie` header)._

### 6.3. Get Profile

- **Route:** `/auth/profile`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 202,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "phone": "string",
    "role": "\"ADMIN\" | \"STAFF\"",
    "tax_code": "string",
    "cccd_number": "string",
    "business_name": "string",
    "representative": "string",
    "industry": "string",
    "industry_label": "string",
    "tax_group": "number",
    "setUpCompletedAt": "Date string | null",
    "created_at": "Date string"
  },
  "meta": null
}
```

### 6.4. Refresh Token

- **Route:** `/auth/refresh`
- **Method:** `POST`
- **Authentication:** None (Requires `refresh_token` in Cookies)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 202,
  "timestamp": "Date string",
  "message": "Refresh success.",
  "data": {
    "accessToken": "string"
  },
  "meta": null
}
```

_(Note: A new `refresh_token` is also set securely via `Set-Cookie` header)._

### 6.5. Logout

- **Route:** `/auth/logout`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header) & `refresh_token` in Cookies

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Logout success.",
  "data": {
    "userId": "string"
  },
  "meta": null
}
```

---

## 7. Onboarding

### 7.1. Get Onboarding Init Data

- **Route:** `/metadata/onboarding-init`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "industries": [
      {
        "id": "number",
        "tagName": "string",
        "iconName": "string | null",
        "mappedTaxId": "number"
      }
    ],
    "taxGroups": [
      {
        "id": "number",
        "groupName": "string",
        "minRevenue": "number",
        "maxRevenue": "number | null",
        "description": "string | null",
        "allowedMethods": "Array of (\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\")"
      }
    ]
  },
  "meta": null
}
```

### 7.2. Setup Tax Configuration

- **Route:** `/onboarding/tax-config`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "industryId": "number",
  "taxGroupId": "number",
  "isOtherIndustry": "boolean (Optional)",
  "isVatReducible": "boolean (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "User onboarding success",
  "data": {
    "id": "string",
    "userId": "string",
    "industryId": "number",
    "taxGroupId": "number",
    "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
    "applyFromDate": "Date string",
    "applyToDate": "Date string | null",
    "vatRateSnapShot": "number",
    "pitRateSnapShot": "number",
    "isVatReducible": "boolean",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 7.3. Update Tax Configuration

- **Route:** `/onboarding/tax-config`
- **Method:** `PUT`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "industryId": "number",
  "taxGroupId": "number",
  "pitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
  "isOtherIndustry": "boolean (Optional)",
  "isVatReducible": "boolean (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Update onboarding success",
  "data": {
    "id": "string",
    "userId": "string",
    "industryId": "number",
    "taxGroupId": "number",
    "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
    "applyFromDate": "Date string",
    "applyToDate": "Date string | null",
    "vatRateSnapShot": "number",
    "pitRateSnapShot": "number",
    "isVatReducible": "boolean",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

---

## 8. Users

### 8.1. Update User Profile

- **Route:** `/users`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "taxCode": "string (Optional)",
  "businessName": "string (Optional)",
  "ownerName": "string (Optional)",
  "provinceCity": "string (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Update user success.",
  "data": {
    "id": "string",
    "phoneNumber": "string",
    "role": "\"ADMIN\" | \"STAFF\"",
    "taxCode": "string",
    "businessName": "string",
    "ownerName": "string",
    "cccdNumber": "string",
    "provinceCity": "string",
    "isActive": "boolean",
    "setUpCompletedAt": "Date string | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

---

## 9. Dashboard

### 9.1. Get Dashboard Summary

- **Route:** `/dashboard/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve dashboard summary successfully",
  "data": {
    "revenueProgress": {
      "totalCurrentRevenue": "number",
      "warningLevel": "\"GREEN\" | \"YELLOW\" | \"RED\"",
      "nextThreshold": "number",
      "percentage": "number"
    },
    "taxDeclarationCard": {
      "periodId": "string",
      "periodName": "string",
      "status": "\"OPEN\" | \"CLOSED\" | \"PENDING_CLOSURE\" | \"OVERDUE_NO_DATA\" | \"OVERDUE_WITH_DATA\"",
      "deadlineDate": "string",
      "isOverdue": "boolean",
      "daysOverdue": "number",
      "estimatedPenalty": "number"
    } | null
  },
  "meta": null
}
```

---

## 10. Financial Periods

### 10.1. Reopen Financial Period

- **Route:** `/financial-periods/:id/reopen`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Reopen financial period success.",
  "data": {
    "publicId": "string",
    "periodName": "string",
    "startDate": "Date string",
    "endDate": "Date string",
    "deadlineDate": "Date string",
    "status": "\"OPEN\"",
    "taxAmount": "number",
    "actualPaymentDate": "Date string | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 10.2. Confirm Tax Payment

- **Route:** `/financial-periods/:id/confirm-payment`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "paymentDate": "Date string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Confirm tax payment success.",
  "data": {
    "publicId": "string",
    "periodName": "string",
    "startDate": "Date string",
    "endDate": "Date string",
    "deadlineDate": "Date string",
    "status": "\"CLOSED\"",
    "taxAmount": "number",
    "actualPaymentDate": "Date string",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 10.3. Compare PIT

- **Route:** `/financial-periods/:id/compare-pit`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Compare PIT success.",
  "data": {
    "profitMethodAmount": "number | null",
    "percentageMethodAmount": "number | null"
  },
  "meta": null
}
```

---

## 11. Internal Production Orders

### 11.1. Create Production Order

- **Route:** `/internal-production-orders`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "notes": "string (Optional)",
  "transactionAt": "Date string",
  "details": [
    {
      "productPublicId": "string",
      "transactionType": "\"ISSUE_MATERIAL\" | \"RECEIVE_PRODUCT\"",
      "quantity": "number"
    }
  ]
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string",
  "message": "Create success.",
  "data": {
    "orderCode": "string",
    "notes": "string | null",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "transactionAt": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "transactionType": "\"ISSUE_MATERIAL\" | \"RECEIVE_PRODUCT\"",
        "quantity": "number",
        "productPublicId": "string",
        "productName": "string",
        "skuCode": "string"
      }
    ]
  },
  "meta": null
}
```

### 11.2. Cancel Production Order

- **Route:** `/internal-production-orders/:orderCode/cancel`
- **Method:** `PATCH`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Cancel success.",
  "data": {
    "orderCode": "string",
    "notes": "string | null",
    "status": "\"CANCELED\"",
    "transactionAt": "Date string",
    "createdAt": "Date string",
    "details": [
      {
        "id": "number",
        "transactionType": "\"ISSUE_MATERIAL\" | \"RECEIVE_PRODUCT\"",
        "quantity": "number",
        "productPublicId": "string",
        "productName": "string",
        "skuCode": "string"
      }
    ]
  },
  "meta": null
}
```

### 11.3. Get All Production Orders

- **Route:** `/internal-production-orders`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `page`: `number (Optional)`
- `limit`: `number (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Get all production order success.",
  "data": [
    {
      "orderCode": "string",
      "notes": "string | null",
      "status": "\"ACTIVE\" | \"CANCELED\"",
      "createdAt": "Date string",
      "details": [
        {
          "id": "number",
          "transactionType": "\"ISSUE_MATERIAL\" | \"RECEIVE_PRODUCT\"",
          "quantity": "number",
          "productPublicId": "string",
          "productName": "string",
          "skuCode": "string"
        }
      ]
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "lastPage": "number"
  }
}
```

---

## 12. Tax Declaration

### 12.1. Init Tax Declaration

- **Route:** `/tax-declaration/init`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Tax declaration init success.",
  "data": {
    "isFirstTime": "boolean",
    "availablePeriods": [
      {
        "publicId": "string",
        "periodName": "string",
        "startDate": "Date string",
        "endDate": "Date string",
        "deadlineDate": "Date string",
        "status": "\"OPEN\" | \"CLOSED\"",
        "taxAmount": "number",
        "actualPaymentDate": "Date string | null",
        "createdAt": "Date string",
        "updatedAt": "Date string"
      }
    ]
  },
  "meta": null
}
```

### 12.2. Start Session

- **Route:** `/tax-declaration/start`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "periodIdPublicId": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "userId": "string",
    "financialPeriodId": "number",
    "step1Data": "object | null",
    "step2Data": "object | null",
    "step3Data": "object | null",
    "step4Data": "object | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 12.3. Get Step 1

- **Route:** `/tax-declaration/step-1/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "taxCode": "string",
    "businessName": "string",
    "ownerName": "string",
    "cccdNumber": "string",
    "provinceCity": "string"
  },
  "meta": null
}
```

### 12.4. Save Step 1

- **Route:** `/tax-declaration/step-1/save/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "taxCode": "string (Optional)",
  "businessName": "string (Optional)",
  "provinceCity": "string (Optional)",
  "cccdNumber": "string (Optional)",
  "ownerName": "string (Optional)"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "userId": "string",
    "financialPeriodId": "number",
    "step1Data": {
      "taxCode": "string",
      "businessName": "string",
      "ownerName": "string",
      "cccdNumber": "string",
      "provinceCity": "string"
    },
    "step2Data": "object | null",
    "step3Data": "object | null",
    "step4Data": "object | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 12.5. Get Step 2

- **Route:** `/tax-declaration/step-2/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "confirmedRevenue": "number"
  },
  "meta": null
}
```

### 12.6. Save Step 2

- **Route:** `/tax-declaration/step-2/save/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "userId": "string",
    "financialPeriodId": "number",
    "step1Data": "object | null",
    "step2Data": {
      "confirmedRevenue": "number"
    },
    "step3Data": "object | null",
    "step4Data": "object | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 12.7. Get Step 3

- **Route:** `/tax-declaration/step-3/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": [
    {
      "productPublicId": "string",
      "productName": "string",
      "unit": "string",
      "actualClosingQuantity": "number"
    }
  ],
  "meta": null
}
```

### 12.8. Save Step 3

- **Route:** `/tax-declaration/step-3/save/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "inventoryItems": [
    {
      "productPublicId": "string",
      "actualClosingQuantity": "number"
    }
  ]
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "userId": "string",
    "financialPeriodId": "number",
    "step1Data": "object | null",
    "step2Data": "object | null",
    "step3Data": [
      {
        "productPublicId": "string",
        "actualClosingQuantity": "number"
      }
    ],
    "step4Data": "object | null",
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 12.9. Get Step 4

- **Route:** `/tax-declaration/step-4/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "totalExpense": "number"
  },
  "meta": null
}
```

### 12.10. Save Step 4

- **Route:** `/tax-declaration/step-4/save/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "id": "string",
    "userId": "string",
    "financialPeriodId": "number",
    "step1Data": "object | null",
    "step2Data": "object | null",
    "step3Data": "object | null",
    "step4Data": {
      "totalExpense": "number"
    },
    "createdAt": "Date string",
    "updatedAt": "Date string"
  },
  "meta": null
}
```

### 12.11. Step 5 Preview

- **Route:** `/tax-declaration/step-5/preview/:publicId`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "period": {
      "publicId": "string",
      "periodName": "string",
      "startDate": "Date string",
      "endDate": "Date string",
      "deadlineDate": "Date string",
      "status": "\"OPEN\" | \"CLOSED\"",
      "taxAmount": "number",
      "actualPaymentDate": "Date string | null",
      "createdAt": "Date string",
      "updatedAt": "Date string"
    },
    "step1Data": {
      "taxCode": "string",
      "businessName": "string",
      "ownerName": "string",
      "cccdNumber": "string",
      "provinceCity": "string"
    } | null,
    "step2Data": {
      "confirmedRevenue": "number"
    } | null,
    "step3Data": [
      {
        "productPublicId": "string",
        "actualClosingQuantity": "number"
      }
    ] | null,
    "step4Data": {
      "totalExpense": "number"
    } | null
  },
  "meta": null
}
```

### 12.12. Submit Declaration

- **Route:** `/tax-declaration/submit/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\""
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "closedPeriod": {
      "publicId": "string",
      "periodName": "string",
      "startDate": "Date string",
      "endDate": "Date string",
      "deadlineDate": "Date string",
      "status": "\"CLOSED\"",
      "taxAmount": "number",
      "actualPaymentDate": "Date string | null",
      "createdAt": "Date string",
      "updatedAt": "Date string"
    },
    "declaration": {
      "id": "number",
      "periodId": "number",
      "declaredRevenue": "number",
      "declaredExpense": "number",
      "vatTaxAmount": "number",
      "pitTaxAmount": "number",
      "totalTaxAmount": "number",
      "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
      "xmlContent": "string",
      "createdAt": "Date string"
    }
  },
  "meta": null
}
```

### 12.13. Submit Force

- **Route:** `/tax-declaration/submit-force/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\""
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "closedPeriod": {
      "publicId": "string",
      "periodName": "string",
      "startDate": "Date string",
      "endDate": "Date string",
      "deadlineDate": "Date string",
      "status": "\"CLOSED\"",
      "taxAmount": "number",
      "actualPaymentDate": "Date string | null",
      "createdAt": "Date string",
      "updatedAt": "Date string"
    },
    "declaration": {
      "id": "number",
      "periodId": "number",
      "declaredRevenue": "number",
      "declaredExpense": "number",
      "vatTaxAmount": "number",
      "pitTaxAmount": "number",
      "totalTaxAmount": "number",
      "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
      "xmlContent": "string",
      "createdAt": "Date string"
    }
  },
  "meta": null
}
```

### 12.14. Submit Ignore Warning

- **Route:** `/tax-declaration/submit-ignore-warning/:publicId`
- **Method:** `POST`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body (JSON)

```json
{
  "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\""
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "string",
  "data": {
    "closedPeriod": {
      "publicId": "string",
      "periodName": "string",
      "startDate": "Date string",
      "endDate": "Date string",
      "deadlineDate": "Date string",
      "status": "\"CLOSED\"",
      "taxAmount": "number",
      "actualPaymentDate": "Date string | null",
      "createdAt": "Date string",
      "updatedAt": "Date string"
    },
    "declaration": {
      "id": "number",
      "periodId": "number",
      "declaredRevenue": "number",
      "declaredExpense": "number",
      "vatTaxAmount": "number",
      "pitTaxAmount": "number",
      "totalTaxAmount": "number",
      "chosenPitMethod": "\"EXEMPT\" | \"PERCENTAGE\" | \"PROFIT_15\" | \"PROFIT_17\" | \"PROFIT_20\"",
      "xmlContent": "string",
      "createdAt": "Date string"
    }
  },
  "meta": null
}
```

---

## 13. Accounting Books

### 13.1. Get Revenue Book Summary

- **Route:** `/accounting-books/revenue/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve revenue book summary successfully",
  "data": {
    "books": {
      "S1a-HKD": {
        "bookMetadata": {
          "businessName": "string",
          "taxCode": "string",
          "bookTitle": "string",
          "ownerName": "string",
          "templateStyle": "string"
        },
        "bookKey": "string",
        "timeFrame": {
          "startDate": "Date string",
          "endDate": "Date string"
        },
        "summary": {
          "tong_doanh_thu": "number",
          "so_luong_don_hang": "number"
        }
      }
    },
    "activeBookKey": "string",
    "syncCode": "string"
  },
  "meta": null
}
```

_(Note: `books` structure varies depending on `activeBookKey` being `S1a-HKD`, `S2a-HKD`, or `S2b-HKD`. Included above is an example for `S1a-HKD`)_

### 13.2. Get Revenue Book Records

- **Route:** `/accounting-books/revenue/records`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`
- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `syncCode`: `string (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve revenue book successfully",
  "data": {
    "rows": [
      {
        "Ngay_Thang": "Date string",
        "Dien_Giai": "string",
        "So_Tien": "number"
      }
    ],
    "meta": {
      "total": "number",
      "page": "number",
      "lastPage": "number"
    },
    "activeBookKey": "string",
    "syncCode": "string",
    "isSummaryOutdated": "boolean"
  },
  "meta": null
}
```

_(Note: `rows` objects format will adapt to the active book schema `S1ARowDto`, `S2ARowDto` or `S2BRowDto`. Provided above is `S1ARowDto` format)_

### 13.3. Get Cash Flow Book Summary

- **Route:** `/accounting-books/cash-flow/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve cash flow book summary successfully",
  "data": {
    "activeBookKey": "string",
    "books": {
      "S03-HKD": {
        "bookMetadata": {
          "businessName": "string",
          "taxCode": "string",
          "bookTitle": "string",
          "ownerName": "string",
          "templateStyle": "string"
        },
        "bookKey": "string",
        "timeFrame": {
          "startDate": "Date string",
          "endDate": "Date string"
        },
        "summary": {
          "So_Du_Dau_Ky": "number",
          "Tong_Thu_Trong_Ky": "number",
          "Tong_Chi_Trong_Ky": "number",
          "So_Du_Cuoi_Ky": "number"
        }
      },
      "S04-HKD": {
        // Same structure as S03-HKD
      }
    },
    "syncCode": "string"
  },
  "meta": null
}
```

### 13.4. Get Cash Flow Book Records

- **Route:** `/accounting-books/cash-flow/records`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`
- `bookKey`: `string (Optional - Enum: "S03", "S04")`
- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `syncCode`: `string (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve cash flow book successfully",
  "data": {
    "rows": [
      {
        "Ngay_Giao_Dich": "Date string",
        "So_Phieu_Thu": "string | null",
        "So_Phieu_Chi": "string | null",
        "Dien_Giai": "string",
        "Tien_Thu": "number",
        "Tien_Chi": "number",
        "So_Du_Ton": "number"
      }
    ],
    "meta": {
      "total": "number",
      "page": "number",
      "lastPage": "number"
    },
    "activeBookKey": "string",
    "syncCode": "string",
    "isSummaryOutdated": "boolean"
  },
  "meta": null
}
```

### 13.5. Get Expense Book Summary

- **Route:** `/accounting-books/expense/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve expense book summary successfully",
  "data": {
    "activeBookKey": "S2c-HKD",
    "books": {
      "S2c-HKD": {
        "bookMetadata": {
          "businessName": "string",
          "taxCode": "string",
          "bookTitle": "string",
          "ownerName": "string",
          "templateStyle": "string"
        },
        "bookKey": "S2C",
        "timeFrame": {
          "startDate": "Date string",
          "endDate": "Date string"
        },
        "summary": {
          "chi_phi_nguyen_vat_lieu": "number",
          "chi_phi_nhan_cong": "number",
          "chi_phi_thue_mat_bang": "number",
          "chi_phi_dich_vu_mua_ngoai": "number",
          "chi_phi_khac": "number",
          "tong_chi_phi_hop_le": "number"
        }
      }
    },
    "syncCode": "string"
  },
  "meta": null
}
```

### 13.6. Get Expense Book Records

- **Route:** `/accounting-books/expense/records`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`
- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `syncCode`: `string (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve expense book successfully",
  "data": {
    "rows": [
      {
        "Ngay_Chi": "Date string",
        "So_Phieu_Chi": "string",
        "Hang_Muc": "string",
        "Dien_Giai": "string",
        "So_Tien": "number",
        "Hoa_Don_Chung_Tu_Kem_Theo": "string"
      }
    ],
    "meta": {
      "total": "number",
      "page": "number",
      "lastPage": "number"
    },
    "activeBookKey": "S2c-HKD",
    "syncCode": "string",
    "isSummaryOutdated": "boolean"
  },
  "meta": null
}
```

### 13.7. Get Inventory Book Summary

- **Route:** `/accounting-books/inventory/summary`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`
- `productPublicIds`: `string (Optional - comma-separated list of product public IDs, e.g. prod-1,prod-2)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve inventory book summary successfully",
  "data": {
    "activeBookKey": "S2d-HKD",
    "books": {
      "S2d-HKD": {
        "bookMetadata": {
          "businessName": "string",
          "taxCode": "string",
          "bookTitle": "Sổ chi tiết vật tư, hàng hóa, sản phẩm",
          "ownerName": "string",
          "templateStyle": "S2D_TEMPLATE"
        },
        "bookKey": "S2D",
        "timeFrame": {
          "startDate": "Date string",
          "endDate": "Date string"
        },
        "summary": {
          "Tong_So_Luong_Ton_Dau_Ky": "number",
          "Tong_So_Luong_Nhap": "number",
          "Tong_Thanh_Tien_Nhap": "number",
          "Tong_So_Luong_Xuat": "number",
          "Tong_Thanh_Tien_Xuat": "number",
          "Tong_So_Luong_Ton_Cuoi_Ky": "number"
        }
      }
    },
    "syncCode": "string"
  },
  "meta": null
}
```

### 13.8. Get Inventory Book Records

- **Route:** `/accounting-books/inventory/records`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Query

- `timeFrame`: `"thang_nay" | "thang_truoc" | "quy_nay" | "custom"`
- `year`: `number (Optional - Required if timeFrame is "custom")`
- `quarter`: `number (Optional - Required if timeFrame is "custom", values 1-4)`
- `productPublicIds`: `string (Optional - comma-separated list of product public IDs, e.g. prod-1,prod-2)`
- `page`: `number (Optional)`
- `limit`: `number (Optional)`
- `syncCode`: `string (Optional)`

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string",
  "message": "Retrieve inventory book successfully",
  "data": {
    "rows": [
      {
        "Ngay_Chung_Tu": "Date string",
        "So_Chung_Tu": "string",
        "Dien_Giai": "string",
        "Product_Id": "number",
        "Product_Name": "string",
        "Sku_Code": "string",
        "Unit": "string",
        "So_Luong_Nhap": "number",
        "Don_Gia_Nhap": "number",
        "Thanh_Tien_Nhap": "number",
        "So_Luong_Xuat": "number",
        "Don_Gia_Xuat": "number",
        "Thanh_Tien_Xuat": "number",
        "So_Luong_Ton": "number"
      }
    ],
    "meta": {
      "total": "number",
      "page": "number",
      "lastPage": "number"
    },
    "activeBookKey": "S2d-HKD",
    "syncCode": "string",
    "isSummaryOutdated": "boolean"
  },
  "meta": null
}
```
