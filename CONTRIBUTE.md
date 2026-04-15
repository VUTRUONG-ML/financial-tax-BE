# 🛠 PROJECT CONTRIBUTING & CODING STANDARDS

Tài liệu này quy định các tiêu chuẩn lập trình bắt buộc dành cho thành viên đội ngũ phát triển và AI hỗ trợ. Mọi Pull Request phải tuân thủ các quy tắc này để được xét duyệt.

---

## 1. 🌍 NGÔN NGỮ & ĐỊNH DẠNG PHẢN HỒI (RESPONSE)

- **Message:** Tất cả `message` trả về trong API hoặc Exception phải được viết bằng **Tiếng Anh**.
- **Cấu trúc Response:** Mọi kết quả trả về từ Controller phải có dạng:

```json
{
  "message": "User profile updated successfully",
  "data": { ... }
}
```

- **HTTP Code:** Luôn khai báo `@HttpCode(HttpStatus.OK)` cho các phương thức không phải GET nếu xử lý thành công.

## 2. 📝 QUY CHUẨN LOGGING NGHIỆP VỤ (STRUCTURED LOGGING)

Đây là phần quan trọng nhất để phục vụ việc truy vết (Audit Trail) cho hệ thống Thuế.

### 2.1. Khởi tạo Logger

Trong mỗi Service, khởi tạo Logger kèm theo context là tên Class:

```typescript
private readonly log = new AppLogger(YourService.name);
```

### 2.2. Cấu trúc một dòng Log

Chúng ta không ghi log bằng các chuỗi String tự do. Mọi dòng log phải sử dụng `LOG_ACTIONS` và `LOG_STATUS` từ hệ thống Constant.

- ❌ **Trường hợp Thất bại (Log Warn/Error)**

Sử dụng khi validation nghiệp vụ thất bại hoặc ném ra Exception. Bắt buộc có `reason`.

```typescript
if (!currentActiveConfig) {
  this.log.warn(LOG_ACTIONS.UPDATE_ONBOARDING, {
    status: LOG_STATUS.FAILED,
    reason: 'NOT_CONFIG_TAX_ACTIVE', // Mô tả ngắn gọn nguyên nhân
    userId,
  });
  throw new BadRequestException('No active tax configurations were found.');
}
```

- ✅ **Trường hợp Thành công (Log Info)**

Sử dụng khi kết thúc một hành động nghiệp vụ quan trọng. Kèm theo các metadata để thống kê.

```typescript
this.log.log(LOG_ACTIONS.UPDATE_ONBOARDING, {
  status: LOG_STATUS.SUCCESS,
  userId,
  industry: industryId,
  taxGroup: taxGroupId,
});
```

## 3. 🔐 AUTHENTICATION & DECORATORS

- `@Public()`: Gắn lên các API không cần Token.
- `@CurrentUser()`: Sử dụng để trích xuất thông tin người dùng hiện tại từ Request Context.
- **Request ID:** Hệ thống tự động gắn `requestId` vào mọi dòng log thông qua `AsyncLocalStorage`. Không cần can thiệp thủ công.

## 4. 🏗 QUY TẮC DATABASE & TRANSACTION

- **ACID:** Các thao tác liên quan đến Tiền (Money), Thuế (Tax), và Chốt sổ (Locking) bắt buộc phải nằm trong Database Transaction.
- **Validation:** Bắt buộc sử dụng DTO và `class-validator` cho mọi input đầu vào.
- **Naming:**
  - Table: `snake_case` số nhiều, ví dụ: `tax_records`
  - File: `kebab-case`
  - Function: `camelCase`

## 5. 📋 DANH SÁCH CONSTANTS LOG (Gợi ý thêm)

| LOG_ACTIONS | LOG_STATUS | Ý nghĩa |
|---|---|---|
| `UPDATE_ONBOARDING` | SUCCESS / FAILED | Cập nhật hồ sơ thuế ban đầu |
| `CREATE_INVOICE` | SUCCESS / FAILED | Tạo hóa đơn bán hàng |
| `CALCULATE_TAX` | SUCCESS / FAILED | Tính toán số thuế phải nộp |
| `REVOKE_TOKEN` | DANGER | Phát hiện hành vi chiếm đoạt token |

**Lưu ý:** Nếu phát hiện lỗi hệ thống chưa được định nghĩa `reason`, hãy bổ sung vào file `constants/log-events.constant.ts`.
