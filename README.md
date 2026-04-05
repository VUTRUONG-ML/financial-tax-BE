# 💼 Finance & Tax Management System (Backend)

## 📌 Giới thiệu

Đây là **core backend service** của hệ thống quản lý tài chính và kê khai thuế dành cho hộ kinh doanh.

Hệ thống tập trung vào:

- 📊 Quản lý dữ liệu tài chính chính xác tuyệt đối
- 🧾 Xử lý nghiệp vụ thuế
- 🔄 Đảm bảo tính nhất quán dữ liệu (data consistency)
- 🏗 Thiết kế backend theo hướng **scalable & maintainable**

> 🎯 Triết lý: **Sai 1 đồng vẫn là sai — không có chỗ cho bug trong hệ thống tài chính**

---

## ⚙️ Yêu cầu hệ thống (Prerequisites)

Để đảm bảo môi trường phát triển đồng nhất:

| Thành phần     | Phiên bản |
| -------------- | --------- |
| Node.js        | v22.x.x   |
| pnpm           | v10.x.x   |
| Docker         | Latest    |
| Docker Compose | Latest    |

### 📌 Lý do sử dụng Docker

- Không cần cài PostgreSQL trực tiếp
- Tránh lỗi khác môi trường giữa các dev
- Dễ dàng reset database

---

## 🏗 Tech Stack & Kiến trúc

### 🧰 Công nghệ sử dụng

- **Framework:** NestJS (Node.js)
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT (Access Token + Refresh Token)
- **Authorization:** RBAC (Role-Based Access Control)
- **DevOps:** Docker Compose

---

### 🧠 Kiến trúc Backend

Áp dụng mô hình phân tầng rõ ràng:

```

src/
├── modules/
│   ├── auth/
│   ├── user/
│   ├── finance/
│   └── tax/
│
├── common/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── decorators/
│
├── prisma/
└── main.ts

```

### 🔎 Nguyên tắc thiết kế

- Separation of Concerns
- Modular Architecture (NestJS)
- DTO Validation rõ ràng
- Centralized Error Handling

---

## 🚀 Hướng dẫn thiết lập (Quick Start)

### 1. Clone dự án

```bash
git clone https://github.com/VUTRUONG-ML/financial-tax-BE.git
```

---

### 2. Khởi động Database (Docker)

Dự án sử dụng Docker để chạy PostgreSQL:

```bash
docker-compose up -d
```

📌 Kiểm tra container:

```bash
docker ps
```

---

### 3. Cài đặt dependencies

```bash
pnpm install
```

---

### 4. Cấu hình môi trường

Tạo file `.env` từ template:

```bash
cp .env.example .env
```

### Ví dụ `.env`

```env
DATABASE_URL="postgresql://user:password@localhost:5432/finance_db"
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
PORT=3000
```

---

### 5. Setup Prisma & Database

```bash
pnpm db:gen
pnpm db:push
```

#### 📌 Giải thích

- `db:gen`: Generate Prisma Client
- `db:push`: Sync schema → database (dev only)

---

### 6. Chạy ứng dụng

```bash
pnpm dev
```

📌 Server chạy tại:

```
http://localhost:3000
```

---

## 🛠 Danh sách lệnh (Scripts)

| Lệnh              | Mô tả                                         |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Chạy NestJS ở chế độ development (watch mode) |
| `pnpm db:gen`     | Generate Prisma Client                        |
| `pnpm db:migrate` | Tạo migration (dùng cho production)           |
| `pnpm db:push`    | Sync schema trực tiếp (dev nhanh)             |
| `pnpm db:studio`  | Mở Prisma Studio (GUI quản lý DB)             |

---

## 🧠 Ghi chú kỹ thuật quan trọng

### 💰 Xử lý tiền tệ (Financial Data)

> ❗ KHÔNG dùng `float` hoặc `double`

✔ Bắt buộc sử dụng:

- `Decimal` (Prisma)
- Tránh sai số khi tính toán tiền

---

### 🔄 Data Consistency

Các nghiệp vụ tài chính cần:

#### 1. Transaction

- Luôn dùng transaction cho:
  - Cập nhật số dư
  - Ghi nhận giao dịch
  - Xử lý thuế

#### 2. Race Condition

Các case nguy hiểm:

- Concurrent update số dư
- Double spending

✔ Giải pháp:

- Pessimistic locking
- Optimistic locking (version field)
- Database transaction

---

### 📊 Isolation Level (PostgreSQL)

Khuyến nghị:

- `READ COMMITTED`
- `REPEATABLE READ` (nếu cần consistency cao hơn)

---

## 🔒 Security

### 🔑 Authentication

- JWT Access Token
- JWT Refresh Token

### 🛡 Authorization

- RBAC (Role-Based Access Control)

Ví dụ:

| Role  | Quyền      |
| ----- | ---------- |
| ADMIN | Toàn quyền |
| USER  | Giới hạn   |

---

## 🚧 Nguyên tắc phát triển

### ⚖️ Ưu tiên hệ thống

```
Data Integrity > Performance
```

- Có thể chậm hơn
- Nhưng không được sai dữ liệu

---

## 📌 Best Practices

- Validate tất cả input (DTO)
- Không trust client
- Handle exception đầy đủ
- Log các action quan trọng
- Không hardcode secrets

---
