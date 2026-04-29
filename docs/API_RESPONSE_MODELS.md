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
  "timestamp": "Date string (ISO 8601)",
  "message": "Product deleted successfully.",
  "data": null,
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
*(Note: Service returns an array `response` for `detailInvoice` because `findMany` is used in Prisma, so `data` is an array containing the single invoice).*

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
  "sellerTaxCode": "string (Optional)",
  "invoiceNo": "string",
  "issueDate": "Date string (ISO 8601)",
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

### 3.2. Get All Inbound Invoices
- **Route:** `/inbound-invoices`
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
  "message": "Get all inbound invoice success.",
  "data": [
    {
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Get detail inbound invoice success.",
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Cancel inbound invoice success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string (ISO 8601)",
    "attachmentUrl": "string",
    "status": "\"CANCELED\"",
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Sync to inventory success.",
  "data": {
    "publicId": "string",
    "sellerName": "string",
    "sellerTaxCode": "string",
    "invoiceNo": "string",
    "issueDate": "Date string (ISO 8601)",
    "attachmentUrl": "string",
    "status": "\"ACTIVE\"",
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

### 4.2. Get All Vouchers
- **Route:** `/vouchers`
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
  "message": "Vouchers retrieved successfully",
  "data": [
    {
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Voucher details retrieved successfully",
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
*(Note: Fields like `voucherType`, `amount`, and `invoicePublicId` cannot be updated).*

#### Response Data (JSON)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "Date string (ISO 8601)",
  "message": "Voucher updated successfully",
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Voucher canceled successfully",
  "data": {
    "voucherCode": "string",
    "voucherType": "\"RECEIPT\" | \"PAYMENT\"",
    "transactionAt": "Date string (ISO 8601)",
    "content": "string",
    "paymentMethod": "\"CASH\" | \"BANK\"",
    "isDeductibleExpense": "boolean",
    "status": "\"CANCELED\"",
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
  "timestamp": "Date string (ISO 8601)",
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
  "timestamp": "Date string (ISO 8601)",
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
  "timestamp": "Date string (ISO 8601)",
  "message": "Voucher category deleted successfully",
  "data": null,
  "meta": null
}
```
