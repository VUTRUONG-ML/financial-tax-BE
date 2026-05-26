# 🚀 Frontend API Integration Guide

**Dành cho**: Frontend developers  
**Mục tiêu**: Hiểu toàn bộ hệ thống, các module, workflow, và cách tích hợp API  
**Version**: 1.0

---

## 📋 Table of Contents

- [1. System Architecture Overview](#1-system-architecture-overview)
- [2. Core Concepts](#2-core-concepts)
- [3. Authentication Flow](#3-authentication-flow)
- [4. Module-by-Module Integration](#4-module-by-module-integration)
  - [4.1 Auth Module](#41-auth-module)
  - [4.2 Products Module](#42-products-module)
  - [4.3 Invoices Module](#43-invoices-module)
  - [4.4 Inbound Invoices Module](#44-inbound-invoices-module)
  - [4.5 Vouchers Module](#45-vouchers-module)
  - [4.6 Tax Declaration Module](#46-tax-declaration-module)
  - [4.7 Financial Periods Module](#47-financial-periods-module)
- [5. Error Handling & Status Codes](#5-error-handling--status-codes)
- [6. Best Practices & Gotchas](#6-best-practices--gotchas)

---

## 1. System Architecture Overview

### 1.1 What This System Does

Hệ thống quản lý tài chính và kê khai thuế cho **Hộ kinh doanh (Small Businesses)** với các chức năng:

- 📊 **Quản lý Hàng hóa**: Tạo, cập nhật sản phẩm, theo dõi tồn kho
- 🧾 **Quản lý Hóa đơn**: Hóa đơn bán ra (outbound) và mua vào (inbound)
- 💰 **Quản lý Phiếu**: Thu/Chi tiền (receipts/payments)
- 🏛️ **Kê khai Thuế**: Tự động tính thuế GTGT và TNDN, tạo file XML để nộp
- 📈 **Dashboard & Báo cáo**: Theo dõi doanh thu, thuế, kỳ kế toán

### 1.2 System Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND                           │
│             (React / Vue / Angular)                 │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │  API Gateway / NestJS       │
        │  Port: 3000                 │
        └────────────┬────────────────┘
                     │
        ┌────────────▼────────────────────────────────┐
        │           Core Modules                      │
        ├─────────────────────────────────────────────┤
        │ • Auth (JWT Token Management)               │
        │ • Products (Inventory Management)           │
        │ • Invoices (Outbound Billing)               │
        │ • Inbound Invoices (Cost Management)        │
        │ • Vouchers (Receipt/Payment Tracking)       │
        │ • Tax Declaration (Tax Filing)              │
        │ • Financial Periods (Closing & Reporting)   │
        │ • Accounting Books (Ledger Tracking)        │
        │ • Dashboard (Business KPIs)                 │
        └────────────┬────────────────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │   PostgreSQL Database       │
        │  (Decimal for Financial)    │
        └─────────────────────────────┘
```

### 1.3 API Response Format

Tất cả API endpoints trả về unified response format:

```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "message": "Operation successful",
  "data": {
    // Dữ liệu thực tế
  },
  "meta": {
    // Pagination info (nếu có)
    "page": 1,
    "lastPage": 5,
    "total": 45
  }
}
```

---

## 2. Configuration: Base URL Setup

### 2.0 Environment & Base URL

Trước khi bắt đầu, frontend cần:

1. **Tạo environment config** để lưu base URL:

```typescript
// src/config/api.config.ts (hoặc .env)
export const API_CONFIG = {
  // 🌍 Development (Local)
  // BACKEND_URL: 'http://localhost:3000',

  // 🌍 Development (Ngrok - để test trên mobile)
  BACKEND_URL: 'https://boresome-megadont-lillianna.ngrok-free.dev',

  // 🌍 Production
  // BACKEND_URL: 'https://api.yourdomain.com',
};

export const API_ROUTES = {
  AUTH: {
    REGISTER: '/v1/auth/register',
    LOGIN: '/v1/auth/login',
    LOGOUT: '/v1/auth/logout',
    REFRESH: '/v1/auth/refresh',
    PROFILE: '/v1/auth/profile',
  },
  PRODUCTS: {
    LIST: '/v1/products',
    CREATE: '/v1/products',
    DETAIL: (publicId: string) => `/v1/products/${publicId}`,
    UPDATE: (publicId: string) => `/v1/products/${publicId}`,
    DELETE: (publicId: string) => `/v1/products/${publicId}`,
  },
  INVOICES: {
    LIST: '/v1/invoices',
    CREATE: '/v1/invoices',
    DETAIL: (id: string) => `/v1/invoices/${id}/details`,
    UPDATE: (id: string) => `/v1/invoices/${id}`,
    PUBLISH: (id: string) => `/v1/invoices/${id}/publish`,
    CANCEL: (id: string) => `/v1/invoices/${id}/cancel`,
  },
  // ... Các routes khác
};
```

⚠️ **URL Pattern**: `<BASE_URL>/v1/<endpoint>`

- **Ví dụ**: `https://boresome-megadont-lillianna.ngrok-free.dev/v1/auth/login`

---

## 2. Core Concepts

### 2.1 Data Types

**💰 Financial Data**:

- ⚠️ **KHÔNG** dùng `float` hoặc `double` - dễ gây sai sót
- ✅ **PHẢI** sử dụng `Decimal` (backend) → `number` hoặc `string` (frontend)
- Ví dụ: Giá `100.50` được lưu dưới dạng `100.5000` (4 chữ số thập phân)

```typescript
// Frontend - Trong khi lấy dữ liệu từ API
const price = parseFloat(data.price); // 100.5
const taxAmount = Number(data.taxAmount); // 50.25

// Hoặc giữ nguyên string nếu chỉ hiển thị
const displayPrice = data.price; // "100.5000"
```

### 2.2 Status Enums

**Invoice Status**:

```
DRAFT → PENDING_ISSUED → ISSUED → CANCELED
         ↓ (nếu lỗi)
       SYNC_FAILED → (retry) → ISSUED
```

**Financial Period Status**:

```
OPEN → CLOSED
```

### 2.3 Ownership & Authorization

- Mỗi resource (Product, Invoice, etc.) thuộc về **một User**
- API tự động trích xuất `userId` từ JWT Token
- ⚠️ **Frontend không cần** gửi `userId`, server tự lấy
- Nếu cố tình truyền `userId` của người khác → **403 Forbidden**

```typescript
// ❌ WRONG - Đừng gửi userId
fetch('/api/invoices', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'hacker-id', // ❌ Nguy hiểm!
    details: [...]
  })
});

// ✅ CORRECT - Server tự lấy từ token
fetch('/api/invoices', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
  },
  body: JSON.stringify({
    details: [...] // userId được trích xuất tự động
  })
});
```

### 2.4 Pagination

List endpoints hỗ trợ query params:

```typescript
// Lấy trang 2, 20 items/trang
GET /api/products?page=2&limit=20

// Response chứa meta:
{
  "data": [...],
  "meta": {
    "page": 2,
    "lastPage": 5,
    "total": 95
  }
}
```

---

## 3. Authentication Flow

### 3.0 HTTP Client Wrapper với Axios và Auto-Refresh Token

**Quan trọng**: Luôn sử dụng wrapper function này để tất cả requests tự động handle token refresh!

```typescript
// src/api/http-client.ts
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_CONFIG } from '../config/api.config';

const TOKEN_KEY = 'accessToken';

export interface ApiError {
  success: boolean;
  statusCode: number;
  message: string;
  data?: {
    code?: string; // VD: 'ACCESS_TOKEN_EXPIRED'
    errors?: any[];
  };
}

const api: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Gửi refresh_token từ cookie
});

async function refreshAccessToken(): Promise<string> {
  const refreshResponse = await axios.post(
    `${API_CONFIG.BACKEND_URL}/v1/auth/refresh`,
    null,
    {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    },
  );

  const refreshResult = refreshResponse.data;
  const newToken = refreshResult?.data?.accessToken;

  if (!newToken) {
    throw new Error('Failed to refresh access token');
  }

  localStorage.setItem(TOKEN_KEY, newToken);
  return newToken;
}

async function requestWithAutoRefresh<T = any>(
  config: AxiosRequestConfig,
  retry = true,
): Promise<T> {
  const accessToken = localStorage.getItem(TOKEN_KEY);
  const headers = {
    ...config.headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  try {
    const response = await api.request<T>({
      ...config,
      headers,
    });
    return response.data;
  } catch (error) {
    if (retry && axios.isAxiosError(error) && error.response?.status === 401) {
      const result = error.response.data as ApiError;
      if (
        result?.data?.code === 'ACCESS_TOKEN_EXPIRED' ||
        result?.message?.includes('token expired')
      ) {
        const newToken = await refreshAccessToken();
        const retryResponse = await api.request<T>({
          ...config,
          headers: {
            ...headers,
            Authorization: `Bearer ${newToken}`,
          },
        });
        return retryResponse.data;
      }
    }

    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }

    throw error;
  }
}

export async function apiCall<T = any>(
  endpoint: string,
  config: AxiosRequestConfig = {},
): Promise<T> {
  try {
    return await requestWithAutoRefresh<T>({
      url: endpoint,
      method: 'GET',
      ...config,
    });
  } catch (error) {
    console.error('API Call Error:', error);
    throw error;
  }
}

export async function apiCallWithRetry<T = any>(
  endpoint: string,
  config: AxiosRequestConfig = {},
  maxRetries = 3,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall<T>(endpoint, config);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 409 &&
        i < maxRetries - 1
      ) {
        const delayMs = 1000 * (i + 1);
        console.log(
          `⚠️ Conflict detected, retrying in ${delayMs}ms... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

**Sử dụng wrapper này:**

```typescript
// ✅ Cách đúng - sử dụng wrapper
const data = await apiCall('/v1/products');
const invoice = await apiCall('/v1/invoices', {
  method: 'POST',
  data: {
    /* ... */
  },
});

// ✅ Nếu cần retry cho race condition (409)
const result = await apiCallWithRetry('/v1/invoices/inv-123/publish', {
  method: 'POST',
});
```

---

### 3.1 User Registration

**Endpoint**: `POST /v1/auth/register`

```typescript
import { apiCall } from './api/http-client';

const register = async (registerData: {
  phoneNumber: string;
  password: string;
  taxCode: string;
  businessName: string;
  ownerName: string;
  cccdNumber: string;
  provinceCity: string;
}) => {
  try {
    const result = await apiCall('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerData),
    });

    return result.data; // User info (WITHOUT password)
  } catch (error) {
    console.error('Register error:', error.message);
    throw error;
  }
};

// Sử dụng:
const user = await register({
  phoneNumber: '0912345678',
  password: 'SecurePass123!',
  taxCode: '0123456789',
  businessName: 'Cửa hàng A Bây giờ',
  ownerName: 'Nguyễn Văn A',
  cccdNumber: '0123456789012',
  provinceCity: 'Hà Nội',
});
```

### 3.2 User Login

**Endpoint**: `POST /v1/auth/login`

```typescript
import { apiCall } from './api/http-client';

const login = async (phoneNumber: string, password: string) => {
  try {
    const result = await apiCall('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber,
        password,
      }),
    });

    // Lưu access token
    const accessToken = result.data.accessToken;
    localStorage.setItem('accessToken', accessToken);

    // ✅ refresh_token được set tự động trong HttpOnly cookie
    // (không cần xử lý thêm)

    return result.data.user;
  } catch (error) {
    console.error('Login error:', error.message);
    throw error;
  }
};

// Sử dụng:
const user = await login('0912345678', 'SecurePass123!');
```

**Response Structure**:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login success.",
  "data": {
    "user": {
      "id": "cuid-string-here",
      "phone": "0912345678",
      "role": "ADMIN",
      "tax_code": "0123456789",
      "cccd_number": "0123456789012",
      "business_name": "Cửa hàng A Bây giờ",
      "representative": "Nguyễn Văn A",
      "industry": "TRADE",
      "industry_label": "Phân phối, cung cấp hàng hóa",
      "tax_group": 2,
      "setUpCompletedAt": "2025-01-15T10:00:00Z",
      "created_at": "2025-01-15T10:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3.3 Token Management & Auto-Refresh

**Access Token**:

- ✅ Hạn sử dụng: 15 phút
- 📍 Lưu ở: `localStorage`
- 🔑 Format: `Authorization: Bearer <access_token>`

**Refresh Token**:

- ✅ Hạn sử dụng: 7 ngày
- 📍 Lưu ở: **HttpOnly Cookie** (tự động được server set)
- 🔄 Dùng để: Lấy access token mới khi hết hạn

⚠️ **Quan trọng**: Sử dụng `apiCall()` wrapper (xem 3.0) thay vì `fetch()` trực tiếp!

**Wrapper sẽ tự động**:

1. ✅ Gửi Authorization header
2. ✅ Kiểm tra 401 + `ACCESS_TOKEN_EXPIRED`
3. ✅ Gọi `/v1/auth/refresh` để lấy token mới
4. ✅ Lưu token vào `localStorage`
5. ✅ **RETRY request ban đầu** với token mới

Bạn **KHÔNG** cần viết code refresh token, wrapper xử lý tất cả!

### 3.4 Logout

**Endpoint**: `POST /v1/auth/logout`

```typescript
import { apiCall } from './api/http-client';

const logout = async () => {
  try {
    await apiCall('/v1/auth/logout', {
      method: 'POST',
    });

    // Xóa access token
    localStorage.removeItem('accessToken');
    // refresh_token được xóa tự động từ server (via Set-Cookie)

    // Redirect login
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error.message);
    // Vẫn redirect login ngay cả khi lỗi
    window.location.href = '/login';
  }
};
```

### 3.5 Get Current User Profile

**Endpoint**: `GET /v1/auth/profile`

```typescript
import { apiCall } from './api/http-client';

const getProfile = async () => {
  try {
    const result = await apiCall('/v1/auth/profile');
    const profile = result.data;

    // Logic onboarding:
    // Nếu user chưa hoàn thành onboarding (setUpCompletedAt = null),
    // frontend sẽ tự động chuyển người dùng sang trang onboarding.
    if (!profile?.setUpCompletedAt) {
      window.location.href = '/onboarding';
    }

    return profile;
  } catch (error) {
    console.error('Get profile error:', error.message);
    throw error;
  }
};
```

---

## 4. Module-by-Module Integration

### 4.1 Auth Module

✅ **Status**: Đã hoàn thành (xem phần 3. Authentication Flow)

---

### 4.2 Products Module

**Mục đích**: Quản lý hàng hóa & dịch vụ, theo dõi tồn kho

**Endpoints Summary**:

| Method   | Path                  | Mô tả                  |
| -------- | --------------------- | ---------------------- |
| `POST`   | `/products`           | Tạo sản phẩm mới       |
| `GET`    | `/products`           | Lấy danh sách sản phẩm |
| `GET`    | `/products/:publicId` | Xem chi tiết sản phẩm  |
| `PUT`    | `/products/:publicId` | Cập nhật sản phẩm      |
| `DELETE` | `/products/:publicId` | Xóa sản phẩm           |

### 4.2.1 Create Product

**Endpoint**: `POST /v1/products`  
**Content-Type**: `multipart/form-data`

```typescript
import { apiCall } from './api/http-client';

const createProduct = async (productData: {
  file?: File;
  productName: string;
  productType: 'FINISHED_GOOD' | 'RAW_MATERIAL' | 'SERVICE';
  skuCode?: string;
  unit: string;
  sellingPrice: number;
  openingStockQuantity: number;
  openingStockUnitCost: number;
}) => {
  try {
    const formData = new FormData();

    if (productData.file) {
      formData.append('file', productData.file);
    }
    formData.append('productName', productData.productName);
    formData.append('productType', productData.productType);
    formData.append('skuCode', productData.skuCode || '');
    formData.append('unit', productData.unit);
    formData.append('sellingPrice', String(productData.sellingPrice));
    formData.append(
      'openingStockQuantity',
      String(productData.openingStockQuantity),
    );
    formData.append(
      'openingStockUnitCost',
      String(productData.openingStockUnitCost),
    );

    // ⚠️ Không set Content-Type - browser tự set multipart/form-data
    const result = await apiCall('/v1/products', {
      method: 'POST',
      headers: {
        // Xóa Content-Type, để browser tự set
      } as any,
      body: formData,
    });

    return result.data;
  } catch (error) {
    console.error('Create product error:', error.message);
    throw error;
  }
};
```

#### 4.2.2 Get All Products

**Endpoint**: `GET /v1/products?page=1&limit=20`

```typescript
import { apiCall } from './api/http-client';

const getProducts = async (page = 1, limit = 20) => {
  try {
    const result = await apiCall(`/v1/products?page=${page}&limit=${limit}`);
    return result.data;
  } catch (error) {
    console.error('Get products error:', error.message);
    throw error;
  }
};
```

#### 4.2.3 Important Product Fields

- **publicId**: Unique ID để reference (dùng cho invoices)
- **currentStock**: Tồn kho hiện tại (cập nhật khi hóa đơn phát hành)
- **productType**: `FINISHED_GOOD` (thành phẩm), `RAW_MATERIAL` (nguyên liệu), `SERVICE` (dịch vụ)
- **sellingPrice**: Giá bán (dùng làm default khi tạo hóa đơn)

---

### 4.3 Invoices Module (Hóa Đơn Bán Ra)

**Mục đích**: Quản lý hóa đơn bán ra, theo dõi doanh thu, tích hợp với Cơ quan Thuế

#### 4.3.1 Invoice Status Lifecycle

```
CREATE (DRAFT) ──► PUBLISH (PENDING_ISSUED) ──► ISSUED
                        ↓ (nếu lỗi)              ↓
                    SYNC_FAILED          CANCEL → CANCELED
                        ↓
                      RETRY ──► ISSUED
```

| Status         | Có thể sửa? | Có thể phát hành? | Có thể hủy? |
| -------------- | ----------- | ----------------- | ----------- |
| DRAFT          | ✅          | ✅                | ❌          |
| PENDING_ISSUED | ❌          | ❌                | ❌          |
| SYNC_FAILED    | ✅          | ✅ (retry)        | ❌          |
| ISSUED         | ❌          | ❌                | ✅          |
| CANCELED       | ❌          | ❌                | ❌          |

#### 4.3.2 Create Invoice (DRAFT)

**Endpoint**: `POST /v1/invoices`

```typescript
import { apiCall } from './api/http-client';

const createInvoice = async (invoiceData: {
  isB2C: boolean;
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  paymentMethod: 'CASH' | 'BANK';
  details: Array<{
    productPublicId: string;
    quantity: number;
  }>;
}) => {
  try {
    const result = await apiCall('/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });

    return result.data;
  } catch (error) {
    console.error('Create invoice error:', error.message);
    throw error;
  }
};

// Sử dụng:
const invoice = await createInvoice({
  isB2C: true,
  paymentMethod: 'CASH',
  details: [
    {
      productPublicId: 'abc123def456',
      quantity: 10,
    },
    {
      productPublicId: 'xyz789uvw123',
      quantity: 5,
    },
  ],
});
```

#### 4.3.3 Update Invoice (DRAFT only)

**Endpoint**: `PATCH /v1/invoices/:invoicePublicId`

```typescript
import { apiCall } from './api/http-client';

const updateInvoice = async (
  invoicePublicId: string,
  updateData: {
    isB2C?: boolean;
    buyerName?: string;
    buyerTaxCode?: string;
    buyerAddress?: string;
    paymentMethod?: 'CASH' | 'BANK';
    details?: Array<{
      productPublicId: string;
      quantity: number;
    }>;
  },
) => {
  try {
    const result = await apiCall(`/v1/invoices/${invoicePublicId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    return result.data;
  } catch (error) {
    console.error('Update invoice error:', error.message);
    throw error;
  }
};
```

#### 4.3.4 Publish Invoice (Request Tax Code)

**Endpoint**: `POST /v1/invoices/:invoicePublicId/publish`

⚠️ **Quan trọng**: Khi phát hành, hóa đơn:

1. Tồn kho bị **trừ đi**
2. Doanh thu được **cộng vào** RevenueTracker
3. Status chuyển thành `PENDING_ISSUED` → gọi API Cơ quan Thuế → `ISSUED`

```typescript
import { apiCallWithRetry } from './api/http-client';

/**
 * Phát hành hóa đơn (request tax code)
 * - Tự động retry nếu gặp 409 Conflict
 * - Tự động refresh token nếu 401 Unauthorized
 */
const publishInvoice = async (invoicePublicId: string) => {
  try {
    // ✅ Dùng apiCallWithRetry vì có thể gặp race condition (409)
    const result = await apiCallWithRetry(
      `/v1/invoices/${invoicePublicId}/publish`,
      {
        method: 'POST',
      },
    );

    console.log('✅ Invoice published successfully:', result.data);
    return result.data;
  } catch (error) {
    console.error('❌ Publish invoice error:', error.message);
    throw error;
  }
};

// Sử dụng:
try {
  const published = await publishInvoice('inv-2025-0001');
  console.log('Status:', published.status); // 'ISSUED'
  console.log('CQT Code:', published.cqtCode); // 'CT/00001'
} catch (error) {
  alert(`Publish failed: ${error.message}`);
}
```

#### 4.3.5 Cancel Invoice (ISSUED only)

**Endpoint**: `PATCH /v1/invoices/:invoicePublicId/cancel`

⚠️ **Quan trọng**: Khi hủy hóa đơn:

1. Tồn kho được **hoàn lại**
2. Doanh thu được **trừ bớt**
3. Phiếu thu liên kết bị **hủy**
4. Status chuyển thành `CANCELED`

```typescript
import { apiCallWithRetry } from './api/http-client';

const cancelInvoice = async (
  invoicePublicId: string,
  cancellationReason?: string,
) => {
  try {
    const result = await apiCallWithRetry(
      `/v1/invoices/${invoicePublicId}/cancel`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          cancellationReason: cancellationReason || 'Hủy theo yêu cầu',
        }),
      },
    );

    return result.data;
  } catch (error) {
    console.error('Cancel invoice error:', error.message);
    throw error;
  }
};
```

#### 4.3.6 Get Invoice Details

**Endpoint**: `GET /v1/invoices/:invoicePublicId/details`

```typescript
import { apiCall } from './api/http-client';

const getInvoiceDetails = async (invoicePublicId: string) => {
  try {
    const result = await apiCall(`/v1/invoices/${invoicePublicId}/details`);
    return result.data[0]; // Array chứa 1 invoice object
  } catch (error) {
    console.error('Get invoice details error:', error.message);
    throw error;
  }
};
```

---

### 4.4 Inbound Invoices Module (Hóa Đơn Mua Vào)

**Mục đích**: Ghi nhận hóa đơn mua hàng từ nhà cung cấp, tích hợp vào tồn kho

#### 4.4.1 Create Inbound Invoice

**Endpoint**: `POST /v1/inbound-invoices`

```typescript
import { apiCall } from './api/http-client';

const createInboundInvoice = async (inboundData: {
  sellerName: string;
  sellerTaxCode?: string;
  invoiceNo: string;
  issueDate: string;
  attachmentUrl?: string;
  isSyncedToInventory?: boolean;
  items: Array<{
    productPublicId: string;
    quantity: number;
    unitCost: string | number;
  }>;
}) => {
  try {
    const result = await apiCall('/v1/inbound-invoices', {
      method: 'POST',
      body: JSON.stringify(inboundData),
    });

    return result.data;
  } catch (error) {
    console.error('Create inbound invoice error:', error.message);
    throw error;
  }
};
```

#### 4.4.2 Sync Inbound Invoice to Inventory

**Endpoint**: `PATCH /v1/inbound-invoices/:publicId/sync-inventory`

⚠️ Khi sync, tồn kho sản phẩm được **cộng thêm**

```typescript
import { apiCall } from './api/http-client';

const syncToInventory = async (inboundInvoicePublicId: string) => {
  try {
    const result = await apiCall(
      `/v1/inbound-invoices/${inboundInvoicePublicId}/sync-inventory`,
      { method: 'PATCH' },
    );

    return result.data;
  } catch (error) {
    console.error('Sync to inventory error:', error.message);
    throw error;
  }
};
```

#### 4.4.3 Cancel Inbound Invoice

**Endpoint**: `PATCH /v1/inbound-invoices/:publicId/cancel`

```typescript
import { apiCall } from './api/http-client';

const cancelInboundInvoice = async (publicId: string) => {
  try {
    const result = await apiCall(`/v1/inbound-invoices/${publicId}/cancel`, {
      method: 'PATCH',
    });

    return result.data;
  } catch (error) {
    console.error('Cancel inbound invoice error:', error.message);
    throw error;
  }
};
```

---

### 4.5 Vouchers Module (Phiếu Thu/Chi)

**Mục đích**: Ghi nhận tiền thu (RECEIPT) từ hóa đơn bán ra hoặc tiền chi (PAYMENT) cho hóa đơn mua vào

#### 4.5.1 Voucher Types

- **RECEIPT**: Phiếu thu tiền (từ hóa đơn bán)
- **PAYMENT**: Phiếu chi tiền (từ hóa đơn mua)

#### 4.5.2 Create Voucher

**Endpoint**: `POST /v1/vouchers`

```typescript
import { apiCall } from './api/http-client';

const createVoucher = async (voucherData: {
  voucherType: 'RECEIPT' | 'PAYMENT';
  categoryId: number;
  content: string;
  amount: string | number;
  paymentMethod: 'CASH' | 'BANK';
  isDeductibleExpense?: boolean;
  outboundInvoicePublicId?: string;
  inboundInvoicePublicId?: string;
}) => {
  try {
    const result = await apiCall('/v1/vouchers', {
      method: 'POST',
      body: JSON.stringify(voucherData),
    });

    return result.data;
  } catch (error) {
    console.error('Create voucher error:', error.message);
    throw error;
  }
};
```

#### 4.5.3 Get Voucher Categories

**Endpoint**: `GET /v1/voucher-categories`

```typescript
import { apiCall } from './api/http-client';

const getVoucherCategories = async () => {
  try {
    const result = await apiCall('/v1/voucher-categories');
    return result.data;
  } catch (error) {
    console.error('Get voucher categories error:', error.message);
    throw error;
  }
};
```

---

### 4.6 Tax Declaration Module

**Mục đích**: Hướng dẫn user kê khai thuế theo bước, tự động tính thuế GTGT & TNDN, tạo XML để nộp

#### 4.6.1 Tax Declaration Flow

```
INIT (Lấy danh sách kỳ kế toán)
  ↓
START SESSION (Chọn kỳ kế toán)
  ↓
STEP 1 (Thông tin hộ kinh doanh)
  ↓
STEP 2 (Xác nhận doanh thu)
  ↓
STEP 3 (Kiểm kê tồn kho cuối kỳ)
  ↓
STEP 4 (Tổng chi phí)
  ↓
STEP 5 (Preview & Xác nhận)
  ↓
SUBMIT (Nộp kê khai)
```

#### 4.6.2 Init Tax Declaration

**Endpoint**: `GET /v1/tax-declaration/init`

```typescript
import { apiCall } from './api/http-client';

const initTaxDeclaration = async () => {
  try {
    const result = await apiCall('/v1/tax-declaration/init');
    return result.data;
  } catch (error) {
    console.error('Init tax declaration error:', error.message);
    throw error;
  }
};
```

#### 4.6.3 Start Tax Declaration Session

**Endpoint**: `POST /v1/tax-declaration/start`

```typescript
import { apiCall } from './api/http-client';

const startTaxDeclaration = async (periodPublicId: string) => {
  try {
    const result = await apiCall('/v1/tax-declaration/start', {
      method: 'POST',
      body: JSON.stringify({
        periodIdPublicId: periodPublicId,
      }),
    });

    return result.data;
  } catch (error) {
    console.error('Start tax declaration error:', error.message);
    throw error;
  }
};
```

#### 4.6.4 Get Step 1 Data

**Endpoint**: `GET /v1/tax-declaration/step-1/:publicId`

```typescript
import { apiCall } from './api/http-client';

const getStep1 = async (sessionPublicId: string) => {
  try {
    const result = await apiCall(
      `/v1/tax-declaration/step-1/${sessionPublicId}`,
    );
    return result.data;
  } catch (error) {
    console.error('Get step 1 error:', error.message);
    throw error;
  }
};
```

#### 4.6.5-4.6.13 Other Tax Declaration Steps

Tương tự như trên, thay thế:

- `http://localhost:3000/api/v1` → `apiCall('/v1')`
- `fetchWithAuth()` → `apiCall()`

```typescript
// Ví dụ: Save Step 1
const saveStep1 = async (sessionPublicId: string, step1Data: any) => {
  const result = await apiCall(
    `/v1/tax-declaration/step-1/save/${sessionPublicId}`,
    {
      method: 'POST',
      body: JSON.stringify(step1Data),
    },
  );
  return result.data;
};

// Ví dụ: Get Step 2
const getStep2 = async (sessionPublicId: string) => {
  const result = await apiCall(`/v1/tax-declaration/step-2/${sessionPublicId}`);
  return result.data;
};

// Ví dụ: Save Step 2
const saveStep2 = async (sessionPublicId: string) => {
  const result = await apiCall(
    `/v1/tax-declaration/step-2/save/${sessionPublicId}`,
    { method: 'POST' },
  );
  return result.data;
};

// ... Tương tự cho Step 3, 4, 5, Submit
```

---

### 4.7 Financial Periods Module

**Mục đích**: Quản lý kỳ kế toán (mở, đóng, xác nhận thanh toán)

#### 4.7.1 Get Dashboard

**Endpoint**: `GET /v1/dashboard/summary`

```typescript
import { apiCall } from './api/http-client';

const getDashboardSummary = async () => {
  try {
    const result = await apiCall('/v1/dashboard/summary');
    return result.data;
  } catch (error) {
    console.error('Get dashboard error:', error.message);
    throw error;
  }
};
```

#### 4.7.2 Confirm Tax Payment

**Endpoint**: `PATCH /v1/financial-periods/:id/confirm-payment`

```typescript
import { apiCall } from './api/http-client';

const confirmTaxPayment = async (
  periodPublicId: string,
  paymentDate: string,
) => {
  try {
    const result = await apiCall(
      `/v1/financial-periods/${periodPublicId}/confirm-payment`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          paymentDate: paymentDate, // "2025-04-20"
        }),
      },
    );

    return result.data;
  } catch (error) {
    console.error('Confirm tax payment error:', error.message);
    throw error;
  }
};
```

---

## 5. Error Handling & Status Codes

### 5.1 HTTP Status Codes

| Code | Meaning       | Action                                    |
| ---- | ------------- | ----------------------------------------- |
| 200  | OK            | Thành công                                |
| 201  | Created       | Tạo resource thành công                   |
| 202  | Accepted      | Đang xử lý (async)                        |
| 400  | Bad Request   | Dữ liệu không hợp lệ (check message)      |
| 401  | Unauthorized  | Access token hết hạn → refresh            |
| 403  | Forbidden     | Không có quyền truy cập resource          |
| 404  | Not Found     | Resource không tồn tại                    |
| 409  | Conflict      | Xung đột (VD: race condition tồn kho)     |
| 422  | Unprocessable | Validation error (VD: B2B thiếu tax code) |
| 500  | Server Error  | Lỗi server (contact admin)                |

### 5.2 Error Response Format

```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2025-01-15T10:00:00.000Z",
  "message": "Validation failed",
  "errorCode": ""
}
```

### 5.3 Common Error Scenarios

#### 5.3.1 Tồn Kho Không Đủ

```
❌ Status: 400
Message: "Insufficient stock for product ABC123"
Reason: Số lượng tồn kho < số lượng cần bán
Solution: Cập nhật số lượng nhập vào, hoặc bán ít hơn
```

#### 5.3.2 Hóa Đơn Ở Trạng Thái Không Được Phép

```
❌ Status: 409
Message: "Invoice is already ISSUED, cannot be updated"
Reason: Cố tình sửa hóa đơn đã phát hành
Solution: Hủy hóa đơn trước (nếu cần), rồi tạo cái mới
```

#### 5.3.3 Access Token Hết Hạn

```
❌ Status: 401
Message: "Unauthorized"
Action: Frontend tự động gọi /auth/refresh để lấy token mới
```

#### 5.3.4 Không Có Quyền Truy Cập Resource

```
❌ Status: 403
Message: "Forbidden"
Reason: Product/Invoice/etc. thuộc user khác
Solution: Check xem bạn có quyền không, hoặc liên hệ admin
```

### 5.4 Retry Strategy

**Wrapper function `apiCallWithRetry()` sẽ tự động xử lý:**

```
1. ❌ Nhận 409 Conflict (race condition)
   ↓
2. ⏳ Wait: 1 giây (attempt 1), 2 giây (attempt 2), 3 giây (attempt 3)
   ↓
3. 🔄 Retry request ban đầu
   ↓
4. ✅ Nếu thành công → trả về kết quả
   ❌ Nếu fail 3 lần → throw error
```

**Cách sử dụng:**

```typescript
import { apiCallWithRetry } from './api/http-client';

try {
  // apiCallWithRetry sẽ tự động retry nếu gặp 409 Conflict
  const result = await apiCallWithRetry(
    '/v1/invoices/inv-123/publish',
    { method: 'POST' },
    3, // maxRetries (default: 3)
  );

  console.log('✅ Success:', result.data);
} catch (error) {
  console.error('❌ Failed after retries:', error.message);
}
```

---

## 6. Best Practices & Gotchas

## 6. Best Practices & Gotchas

### 6.1 Do's ✅

1. **Sử dụng `apiCall()` wrapper cho tất cả requests**

   ```typescript
   // ✅ CORRECT
   const result = await apiCall('/v1/products', { method: 'GET' });

   // ❌ WRONG - Không tự động refresh token
   const response = await fetch('...');
   ```

2. **Sử dụng `apiCallWithRetry()` cho operations có thể gặp race condition**

   ```typescript
   // ✅ Publish invoice (có thể 409)
   await apiCallWithRetry('/v1/invoices/inv-123/publish', { method: 'POST' });

   // ✅ Cancel invoice (có thể 409)
   await apiCallWithRetry(`/v1/invoices/${id}/cancel`, { method: 'PATCH' });
   ```

3. **Luôn catch error và hiển thị message cho user**

   ```typescript
   try {
     const result = await apiCall('/v1/products', { method: 'POST', body });
     alert('✅ ' + result.message);
   } catch (error) {
     alert('❌ ' + error.message);
   }
   ```

4. **Validate dữ liệu trước gửi API**

   ```typescript
   // ❌ WRONG
   if (!buyerTaxCode) {
     // Gửi API → lỗi 422 validation error
   }

   // ✅ CORRECT
   if (isB2C === false && !buyerTaxCode) {
     alert('B2B invoice phải có tax code');
     return;
   }
   ```

5. **Lưu token vào `localStorage` sau login**

   ```typescript
   const user = await login(phone, password);
   localStorage.setItem('accessToken', accessToken);
   ```

6. **Luôn dùng `credentials: 'include'`** (wrapper đã xử lý)
   - Để gửi/nhận refresh_token cookie

### 6.2 Don'ts ❌

1. **KHÔNG** dùng `fetch()` trực tiếp

   ```typescript
   // ❌ WRONG
   const response = await fetch('/v1/auth/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(data),
   });
   ```

2. **KHÔNG** gửi password, userId, refresh_token trong request body

   ```typescript
   // ❌ WRONG
   {
     "userId": "user-123", // ❌ Server lấy từ token
     "password": "secret", // ❌ Không gửi
     "refreshToken": "..." // ❌ Lưu trong cookie
   }
   ```

3. **KHÔNG** tin tưởng giá tiền từ frontend

   ```typescript
   // ❌ WRONG
   const unitPrice = userInput.price; // Gửi lên API

   // ✅ CORRECT
   // Server query giá từ database, không dùng giá từ frontend
   ```

4. **KHÔNG** dùng `float` cho tính toán tiền

   ```typescript
   // ❌ WRONG
   const tax = 10000000 * 0.1; // = 999999.9999999999

   // ✅ CORRECT
   // Nhận từ API (server tính dùng Decimal)
   const tax = result.data.taxAmount; // "1000000.0000"
   ```

5. **KHÔNG** quên set `Content-Type` (wrapper xử lý, nhưng FormData thì đặc biệt)

   ```typescript
   // FormData (upload file)
   const formData = new FormData();
   formData.append('file', file);
   formData.append('productName', 'Áo');

   // ⚠️ KHÔNG set Content-Type, để browser tự set multipart/form-data
   const result = await apiCall('/v1/products', {
     method: 'POST',
     headers: {} as any, // Remove Content-Type
     body: formData,
   });
   ```

### 6.3 Common Gotchas

#### Gotcha #1: Invoice DRAFT không trừ tồn kho

```typescript
// ❌ WRONG: Giả định tồn kho bị trừ ngay khi tạo
const invoice = await apiCall('/v1/invoices', {
  method: 'POST',
  body: JSON.stringify({
    details: [{ productPublicId: 'xyz', quantity: 10 }],
  }),
});
// ❌ Tồn kho vẫn nguyên! Chỉ trừ khi publish

// ✅ CORRECT: Tồn kho chỉ trừ khi PUBLISH
await apiCallWithRetry(`/v1/invoices/${invoice.data.publicId}/publish`, {
  method: 'POST',
});
// ✅ Tồn kho bị trừ lúc này
```

#### Gotcha #2: Wrapper tự động refresh token

```typescript
// ❌ WRONG: Cố refresh token thủ công
const response = await fetch('/v1/auth/refresh', { ... });

// ✅ CORRECT: Wrapper xử lý tất cả
// Nếu 401 + ACCESS_TOKEN_EXPIRED:
// 1. Gọi /v1/auth/refresh
// 2. Lưu token mới
// 3. Retry request ban đầu
const result = await apiCall('/v1/products');
```

#### Gotcha #3: B2C vs B2B validation

```typescript
// ❌ WRONG
{
  "isB2C": false,
  "buyerName": "Công ty XYZ"
  // buyerTaxCode: null ← Lỗi 422!
}

// ✅ CORRECT
if (isB2C === false) {
  if (!buyerTaxCode) {
    alert('B2B invoice phải có tax code');
    return;
  }
}
```

#### Gotcha #4: FormData và multipart/form-data

```typescript
// ❌ WRONG: Set Content-Type cho FormData
const formData = new FormData();
formData.append('file', file);

const result = await apiCall('/v1/products', {
  method: 'POST',
  headers: { 'Content-Type': 'multipart/form-data' }, // ❌
  body: formData,
});

// ✅ CORRECT: Để browser tự set
const result = await apiCall('/v1/products', {
  method: 'POST',
  headers: {} as any, // Xóa Content-Type
  body: formData,
});
```

#### Gotcha #5: URL pattern là `/v1/...` không phải `/api/v1/...`

```typescript
// ❌ WRONG
const result = await apiCall('/api/v1/products');

// ✅ CORRECT
const result = await apiCall('/v1/products');

// Wrapper sẽ combine: BASE_URL + endpoint
// https://boresome-megadont-lillianna.ngrok-free.dev/v1/products
```

### 6.4 Checklist Trước Khi Deploy

- [ ] ✅ Tạo `api.config.ts` với `BASE_URL` và `API_ROUTES`
- [ ] ✅ Tạo `http-client.ts` với `apiCall()` và `apiCallWithRetry()`
- [ ] ✅ Sử dụng `apiCall()` cho tất cả GET/POST/PATCH/DELETE requests
- [ ] ✅ Sử dụng `apiCallWithRetry()` cho publish/cancel operations
- [ ] ✅ Access token lưu ở `localStorage` sau login
- [ ] ✅ Refresh token auto-set trong cookie (không cần xử lý)
- [ ] ✅ Xử lý lỗi 401 tự động (wrapper sẽ refresh + retry)
- [ ] ✅ Xử lý lỗi 409 tự động (wrapper sẽ retry)
- [ ] ✅ Validation dữ liệu B2C/B2B trước gửi API
- [ ] ✅ Error message từ API được hiển thị cho user
- [ ] ✅ Loading state khi gửi request
- [ ] ✅ Pagination khi lấy danh sách
- [ ] ✅ Không dùng `float` cho tiền (dùng `Decimal` từ API)
- [ ] ✅ URL pattern là `/v1/...` không phải `/api/v1/...`
- [ ] ✅ Xóa `Content-Type` header khi upload file (FormData)

---

## Appendix: Code Examples

### Example 1: Setup HTTP Client & Base URL

```typescript
// src/config/api.config.ts
export const API_CONFIG = {
  // 🌍 LOCAL
  // BACKEND_URL: 'http://localhost:3000',

  // 🌍 NGROK (Mobile testing)
  BACKEND_URL: 'https://boresome-megadont-lillianna.ngrok-free.dev',

  // 🌍 PRODUCTION
  // BACKEND_URL: 'https://api.yourdomain.com',
};

export const API_ROUTES = {
  AUTH: {
    REGISTER: '/v1/auth/register',
    LOGIN: '/v1/auth/login',
    LOGOUT: '/v1/auth/logout',
    REFRESH: '/v1/auth/refresh',
    PROFILE: '/v1/auth/profile',
  },
  PRODUCTS: {
    LIST: '/v1/products',
    CREATE: '/v1/products',
    DETAIL: (id: string) => `/v1/products/${id}`,
  },
  INVOICES: {
    LIST: '/v1/invoices',
    CREATE: '/v1/invoices',
    PUBLISH: (id: string) => `/v1/invoices/${id}/publish`,
    CANCEL: (id: string) => `/v1/invoices/${id}/cancel`,
  },
  // ... Các routes khác
};
```

### Example 2: Complete Auth + Create Invoice Flow

```typescript
import { apiCall, apiCallWithRetry } from './api/http-client';
import { API_ROUTES } from './config/api.config';

// 1. Login
const handleLogin = async (phone: string, password: string) => {
  try {
    const result = await apiCall(API_ROUTES.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phone, password }),
    });

    localStorage.setItem('accessToken', result.data.accessToken);
    alert('✅ Login success');
    return result.data.user;
  } catch (error) {
    alert('❌ ' + error.message);
  }
};

// 2. Get Products
const handleGetProducts = async () => {
  try {
    const result = await apiCall(API_ROUTES.PRODUCTS.LIST);
    return result.data;
  } catch (error) {
    alert('❌ ' + error.message);
  }
};

// 3. Create Invoice
const handleCreateInvoice = async (details: any[]) => {
  try {
    // Validate B2C/B2B
    if (isB2C === false && !buyerTaxCode) {
      alert('B2B invoice phải có tax code');
      return;
    }

    const result = await apiCall(API_ROUTES.INVOICES.CREATE, {
      method: 'POST',
      body: JSON.stringify({
        isB2C,
        buyerName,
        buyerTaxCode,
        paymentMethod: 'CASH',
        details,
      }),
    });

    alert('✅ Invoice created (DRAFT)');
    return result.data;
  } catch (error) {
    alert('❌ ' + error.message);
  }
};

// 4. Publish Invoice
const handlePublishInvoice = async (invoiceId: string) => {
  try {
    // ✅ Use apiCallWithRetry for potential 409 conflicts
    const result = await apiCallWithRetry(
      API_ROUTES.INVOICES.PUBLISH(invoiceId),
      { method: 'POST' },
    );

    alert('✅ Invoice published (ISSUED)');
    console.log('CQT Code:', result.data.cqtCode);
    return result.data;
  } catch (error) {
    alert('❌ ' + error.message);
  }
};

// 5. Complete Flow
const handleCompleteWorkflow = async () => {
  const user = await handleLogin('0912345678', 'password');
  const products = await handleGetProducts();

  const invoice = await handleCreateInvoice([
    {
      productPublicId: products[0].publicId,
      quantity: 10,
    },
  ]);

  const published = await handlePublishInvoice(invoice.publicId);
};
```

### Example 3: Error Handling & User Feedback

```typescript
import { apiCall, apiCallWithRetry } from './api/http-client';

const handlePublishWithFeedback = async (invoiceId: string) => {
  // Show loading
  setIsLoading(true);
  setError(null);

  try {
    const result = await apiCallWithRetry(
      `/v1/invoices/${invoiceId}/publish`,
      { method: 'POST' },
      3, // maxRetries
    );

    // ✅ Success feedback
    setSuccess('✅ Invoice published!');
    setData(result.data);
  } catch (error) {
    // ❌ Error feedback
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    setError('❌ ' + errorMessage);

    // Log để debugging
    console.error('Publish failed:', error);
  } finally {
    setIsLoading(false);
  }
};
```

---

## Support & Resources

- 📖 **API Models**: `/docs/API_RESPONSE_MODELS.md`
- 📄 **Backend README**: `/README.md`
- 🌐 **Backend URL** (Dev): `https://boresome-megadont-lillianna.ngrok-free.dev`
- 🐛 **Report Issues**: Contact backend team
- 💬 **Questions**: Slack #backend-support

---

**Last Updated**: 2025-01-15  
**Version**: 2.0 (Updated with auto-refresh token & correct URL pattern)
