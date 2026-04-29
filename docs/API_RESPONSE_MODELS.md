# API Endpoints & Data Models Documentation

This document describes the request and response data structures of the core API endpoints. Responses use the global application wrapper structure. The values inside the JSON structures denote the **data types** rather than example data.

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
  "timestamp": "Date string (ISO 8601)",
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
    "createdAt": "Date string (ISO 8601)"
  },
  "meta": null
}
```

### 1.2. Get All Products

- **Route:** `/products`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string (ISO 8601)",
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
      "createdAt": "Date string (ISO 8601)"
    }
  ],
  "meta": null
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
  "timestamp": "Date string (ISO 8601)",
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
    "createdAt": "Date string (ISO 8601)"
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
  "timestamp": "Date string (ISO 8601)",
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
    "createdAt": "Date string (ISO 8601)"
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
  "isB2C": "boolean",
  "buyerName": "string",
  "buyerTaxCode": "string",
  "buyerAddress": "string",
  "details": [
    {
      "productPublicId": "string",
      "quantity": "number",
      "unitPrice": "number"
    }
  ]
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string (ISO 8601)",
  "message": "Invoice created successfully.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string",
    "buyerTaxCode": "string",
    "buyerAddress": "string",
    "status": "\"DRAFT\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string",
    "issuedAt": "Date string (ISO 8601)",
    "createdAt": "Date string (ISO 8601)",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string"
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Complete the process of calling the tax authority for the code.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string",
    "buyerTaxCode": "string",
    "buyerAddress": "string",
    "status": "\"DRAFT\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string",
    "issuedAt": "Date string (ISO 8601)",
    "createdAt": "Date string (ISO 8601)"
  },
  "meta": null
}
```

### 2.3. Get All Invoices

- **Route:** `/invoices`
- **Method:** `GET`
- **Authentication:** Required (Bearer Token in Authorization Header)

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string (ISO 8601)",
  "message": "Get all invoice own success",
  "data": [
    {
      "publicId": "string",
      "invoiceSymbol": "string",
      "isB2C": "boolean",
      "buyerName": "string",
      "buyerTaxCode": "string",
      "buyerAddress": "string",
      "status": "\"DRAFT\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
      "isPaid": "boolean",
      "totalPayment": "number",
      "paidAmount": "number",
      "remainingAmount": "number",
      "cqtCode": "string",
      "issuedAt": "Date string (ISO 8601)",
      "createdAt": "Date string (ISO 8601)",
      "details": [
        {
          "id": "number",
          "productNameSnapshot": "string",
          "quantity": "number",
          "unitPrice": "number",
          "totalAmount": "number",
          "productPublicId": "string"
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Get detail success.",
  "data": [
    {
      "publicId": "string",
      "invoiceSymbol": "string",
      "isB2C": "boolean",
      "buyerName": "string",
      "buyerTaxCode": "string",
      "buyerAddress": "string",
      "status": "\"DRAFT\" | \"ISSUED\" | \"SYNC_FAILED\" | \"CANCELED\"",
      "isPaid": "boolean",
      "totalPayment": "number",
      "paidAmount": "number",
      "remainingAmount": "number",
      "cqtCode": "string",
      "issuedAt": "Date string (ISO 8601)",
      "createdAt": "Date string (ISO 8601)",
      "details": [
        {
          "id": "number",
          "productNameSnapshot": "string",
          "quantity": "number",
          "unitPrice": "number",
          "totalAmount": "number",
          "productPublicId": "string"
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

#### Request Body

None

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string (ISO 8601)",
  "message": "Invoice canceled success.",
  "data": {
    "publicId": "string",
    "invoiceSymbol": "string",
    "isB2C": "boolean",
    "buyerName": "string",
    "buyerTaxCode": "string",
    "buyerAddress": "string",
    "status": "\"CANCELED\"",
    "isPaid": "boolean",
    "totalPayment": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "cqtCode": "string",
    "issuedAt": "Date string (ISO 8601)",
    "createdAt": "Date string (ISO 8601)",
    "details": [
      {
        "id": "number",
        "productNameSnapshot": "string",
        "quantity": "number",
        "unitPrice": "number",
        "totalAmount": "number",
        "productPublicId": "string"
      }
    ]
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
  "sellerTaxCode": "string",
  "invoiceNo": "string",
  "issueDate": "Date string (ISO 8601)",
  "attachmentUrl": "string",
  "isSyncedToInventory": "boolean",
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Create success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string (ISO 8601)",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "isSyncedToInventory": "boolean",
    "isPaid": "boolean",
    "totalAmount": "number",
    "paidAmount": "number",
    "remainingAmount": "number",
    "createdAt": "Date string (ISO 8601)",
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
  "isDeductibleExpense": "boolean",
  "inboundInvoicePublicId": "string",
  "outboundInvoicePublicId": "string"
}
```

#### Response Data (JSON)

```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "Date string (ISO 8601)",
  "message": "Voucher created successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string (ISO 8601)",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"ACTIVE\" | \"CANCELED\"",
    "amount": "number",
    "createdAt": "Date string (ISO 8601)",
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
  "timestamp": "Date string (ISO 8601)",
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
