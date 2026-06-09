# Hướng Dẫn Tích Hợp & Giải Đáp Nghiệp Vụ Module Lệnh Sản Xuất (FE ↔ BE)

Tài liệu này hướng dẫn chi tiết cách tích hợp các API của module **Lệnh sản xuất nội bộ (Internal Production Orders)** cho Frontend (FE) dựa trên cập nhật mới nhất từ Backend (BE), đồng thời giải đáp toàn bộ các câu hỏi nghiệp vụ và mâu thuẫn được đề xuất trong kế hoạch [plan_api_production_orders.md](file:///e:/financial-tax-system_BE/docs-coding-guidelines/plan_api_production_orders.md).

---

## 1. Bản Đồ API Module Lệnh Sản Xuất (BE Contract cập nhật)

Tất cả các API của module Lệnh sản xuất đều yêu cầu Token đăng nhập (`JwtAuthGuard`) và được gác cổng bảo vệ bởi `PeriodLockGuard` (chặn thay đổi khi kỳ kế toán đã đóng):

| Chức năng | Method | Endpoint | Query / Body Payload | Mô tả & Ràng buộc nghiệp vụ |
| :--- | :---: | :--- | :--- | :--- |
| **Thống kê tổng quan** | `GET` | `/v1/internal-production-orders/summary` | Không có | Trả về tổng số lệnh, số lệnh đang hoạt động (`ACTIVE`) và số lệnh đã hủy (`CANCELED`). |
| **Lấy danh sách** | `GET` | `/v1/internal-production-orders` | Query: `page`, `limit`, `status` hoặc `type` | Hỗ trợ lọc phân trang và lọc theo trạng thái không phân biệt hoa thường (ví dụ: `ACTIVE`, `CANCELED`, `đã hủy`, `hoàn tất`). |
| **Chi tiết lệnh** | `GET` | `/v1/internal-production-orders/:orderCode` | Tham số `:orderCode` trên URL | Trả về chi tiết thông tin lệnh và danh sách chi tiết nguyên vật liệu/thành phẩm. |
| **Tạo lệnh sản xuất** | `POST` | `/v1/internal-production-orders` | Body: `CreateProductionOrderDto` | Lập lệnh mới. BE tự sinh mã lệnh dạng `LSX-MMYY-XXXX`, tự động trừ kho nguyên liệu và cộng kho + tính giá bình quân gia quyền cho thành phẩm. |
| **Cập nhật lệnh** | `PATCH` | `/v1/internal-production-orders/:orderCode` | Body: `UpdateProductionOrderDto` | Cập nhật thông tin ghi chú, ngày giao dịch hoặc cập nhật lại chi tiết nguyên vật liệu/thành phẩm. |
| **Hủy lệnh sản xuất** | `PATCH` | `/v1/internal-production-orders/:orderCode/cancel` | Tham số `:orderCode` trên URL | Chuyển trạng thái lệnh sang `CANCELED` và thực hiện hoàn kho nguyên liệu + trừ kho thành phẩm (chặn hủy nếu thành phẩm đã bán đi dẫn tới âm kho). |

---

## 2. Giải Quyết Mâu Thuẫn & Giải Đáp Chi Tiết Nghiệp Vụ

### 2.1. Cải tiến lớn: Hỗ trợ API Cập Nhật (`PATCH /:orderCode`) và Hủy Lệnh (`PATCH /:orderCode/cancel`)
* **Mâu thuẫn ban đầu của FE:** FE cho rằng BE không hỗ trợ sửa lệnh sản xuất (chỉ cho phép Xem và Hủy), dẫn đến đề xuất làm UI ở chế độ Read-only sau khi lưu.
* **Cập nhật thực tế từ BE:** **Backend ĐÃ hỗ trợ chỉnh sửa lệnh sản xuất (`PATCH /v1/internal-production-orders/:orderCode`) và tự động hóa toàn bộ logic đảo ngược giá vốn khi hủy lệnh (`PATCH /v1/internal-production-orders/:orderCode/cancel`).**
* **Cơ chế tính toán Giá vốn bình quân của BE khi Sửa hoặc Hủy lệnh:**
  Để đảm bảo tính nhất quán tuyệt đối của kho và giá vốn bình quân gia quyền (Weighted Average Costing), Backend chạy một giao dịch cơ sở dữ liệu (`Prisma.Transaction`) tự động xử lý theo các bước:
  1. **Đảo ngược lệnh cũ (Revert):**
     * Trả lại số lượng nguyên vật liệu cũ vào kho.
     * Trừ bớt số lượng thành phẩm cũ khỏi kho và hoàn trả lại giá vốn bình quân gia quyền của thành phẩm về trạng thái trước khi có lệnh sản xuất này bằng công thức giật lùi:
       $$C_{reverted} = \frac{(Q_{curr} \times C_{curr}) - (Q_{old} \times C_{old})}{Q_{curr} - Q_{old}}$$
     * *Ràng buộc chống âm kho:* Nếu lượng tồn kho hiện tại của thành phẩm nhỏ hơn số lượng thu được từ lệnh sản xuất cũ (do doanh nghiệp đã bán hàng trước khi sửa hoặc hủy lệnh), hệ thống sẽ chặn giao dịch và trả về lỗi `400 Bad Request`.
  2. **Áp dụng lệnh mới (chỉ đối với Sửa lệnh - Apply):**
     * Kiểm tra tồn kho nguyên liệu mới có đủ không.
     * Tính toán tổng chi phí nguyên liệu mới $\rightarrow$ Tính giá vốn đơn vị thành phẩm mới.
     * Trừ kho nguyên liệu mới và cộng kho + tính lại đơn giá bình quân gia quyền mới cho thành phẩm.
* **Hướng dẫn cho FE:** FE hoàn toàn có thể giữ nguyên giao diện nút **Chỉnh sửa (Edit)** và nút **Hủy (Cancel)**. Khi lưu cập nhật hoặc bấm hủy, FE gọi API tương ứng. Nếu nhận mã lỗi `400` kèm thông báo không đủ tồn kho để đảo ngược, FE hãy hiển thị popup cảnh báo lỗi cho người dùng.
* **Ghi nhật ký Audit:** Cả 2 thao tác cập nhật và hủy bỏ đều được BE tự động ghi lại lịch sử thay đổi vào bảng `AuditLog` để phục vụ thanh tra thuế.

### 2.2. Ánh xạ mã lệnh (`orderCode`) và định danh `id`
* **Vấn đề:** FE sử dụng `id` (UUID) để quản lý route và danh sách, trong khi BE dùng `orderCode` (ví dụ: `LSX-0526-0001`).
* **Giải pháp:** Backend trả về cả hai trường dữ liệu trong DTO phản hồi. Tuy nhiên, để đảm bảo tính nhất quán và dễ tìm kiếm, FE nên ánh xạ route và gọi API chi tiết/hủy thông qua trường `orderCode`. Dữ liệu trả về từ BE sẽ có cấu trúc:
  ```json
  {
    "orderCode": "LSX-0526-0001",
    "status": "ACTIVE",
    "transactionAt": "2026-05-30T12:00:00.000Z",
    "notes": "Lập lệnh sản xuất thử nghiệm"
  }
  ```
  Khi map sang FE model, gán `id = orderCode` và `order_code = orderCode` để giữ nguyên luồng logic hiện tại của FE mà không cần sửa đổi lớn về mặt UI.

### 2.3. Trạng thái lệnh sản xuất
* **Quy ước trạng thái:**
  * Backend sử dụng: `"ACTIVE"` (đang hoạt động/hoàn tất) và `"CANCELED"` (đã hủy).
  * Frontend sử dụng: `"COMPLETED"` và `"CANCELED"`.
  * **Giải pháp:** Mapper trên FE sẽ chuyển đổi:
    * Khi nhận dữ liệu từ BE: `ACTIVE` $\rightarrow$ `COMPLETED` để hiển thị nhãn màu xanh lá trên UI.
    * Khi hiển thị chi tiết hoặc trạng thái hủy: giữ nguyên logic hủy.

### 2.4. Ngày chứng từ (`transactionAt` vs `order_date`)
* **Cách gửi lên:** FE lấy giá trị từ trường ngày chứng từ (`order_date` dạng `YYYY-MM-DD`) và truyền xuống BE trong trường `transactionAt` dưới dạng ISO String (ví dụ: `${order_date}T12:00:00.000Z`).
* **Cách nhận về:** FE nhận trường `transactionAt` từ BE, thực hiện cắt chuỗi `transactionAt.slice(0, 10)` để gán lại cho `order_date` trên UI.

### 2.5. Thông tin đơn giá và Đơn vị tính (`unit`) trong chi tiết
* **Đơn giá vốn & Đơn vị tính:** Màn hình lập lệnh sản xuất (Module B3) theo thiết kế giao diện sẽ không hiển thị đơn giá hay thành tiền (để tránh người dùng nhầm lẫn với dòng tiền thu/chi). BE sẽ chỉ quản lý số lượng (`quantity`) để phục vụ chuyển hóa kho S05.
* **Hướng dẫn cho FE:** FE map mặc định `unit_cost: 0` và `total_amount: 0` để đáp ứng interface của UI. Đối với trường đơn vị tính (`unit`), FE có thể thực hiện tra cứu nhanh từ danh mục sản phẩm (`master products`) đã được tải sẵn ở store dựa trên `productPublicId`.

---

## 3. Thống Kê Tổng Quan Siêu Tốc (Aggregate Performance)

API `/v1/internal-production-orders/summary` được triển khai bằng các câu lệnh truy vấn count/aggregate song song chạy trực tiếp dưới Database:
```json
{
  "totalOrders": 7,
  "completedOrders": 5,
  "canceledOrders": 2
}
```
* **totalOrders:** Tổng số lượng lệnh sản xuất của tài khoản.
* **completedOrders:** Tổng số lượng lệnh ở trạng thái hoạt động (`ACTIVE`).
* **canceledOrders:** Tổng số lượng lệnh đã bị hủy (`CANCELED`).

*Lưu ý cho FE:* Không cần thực hiện đếm hoặc tính toán thủ công trên mảng danh sách lệnh tại Node.js/Browser, hãy gọi trực tiếp API này để lấy thông số hiển thị lên 3 ô thống kê đầu trang danh sách.

---

## 4. Code Ví Dụ Tích Hợp API (FE Service)

Dưới đây là gợi ý viết file dịch vụ kết nối trên Frontend:

```typescript
import { apiCall } from '../lib/http-client';
import type { InternalProductionOrder } from '../types/invoice';
import { getProducts } from './master.service';

export interface ProductionItemPayload {
  productPublicId: string;
  quantity: number;
}

export interface SaveProductionOrderPayload {
  notes?: string;
  transactionAt: string;
  materials: ProductionItemPayload[];
  products: ProductionItemPayload[];
}

/**
 * 1. Gọi API Lấy chi tiết lệnh
 */
export async function getProductionOrderDetail(orderCode: string): Promise<InternalProductionOrder> {
  const products = await getProducts({ page: 1, limit: 1000 });
  const response = await apiCall<{ data: any }>(`/v1/internal-production-orders/${orderCode}`);
  return mapToFEModel(response.data, products);
}

/**
 * 2. Gọi API Tạo lệnh mới
 */
export async function createProductionOrder(payload: SaveProductionOrderPayload): Promise<any> {
  return await apiCall('/v1/internal-production-orders', {
    method: 'POST',
    data: payload,
  });
}

/**
 * 3. Gọi API Sửa đổi lệnh sản xuất
 */
export async function updateProductionOrder(orderCode: string, payload: SaveProductionOrderPayload): Promise<any> {
  return await apiCall(`/v1/internal-production-orders/${orderCode}`, {
    method: 'PATCH',
    data: payload,
  });
}

/**
 * 4. Hủy lệnh sản xuất
 */
export async function cancelProductionOrder(orderCode: string): Promise<any> {
  return await apiCall(`/v1/internal-production-orders/${orderCode}/cancel`, {
    method: 'PATCH',
  });
}

/**
 * Hàm map DTO từ BE sang FE Model để binding UI
 */
function mapToFEModel(dto: any, products: any[]): InternalProductionOrder {
  const productMap = new Map(products.map(p => [p.publicId, p]));
  
  return {
    id: dto.orderCode,
    user_id: 'current-user',
    order_code: dto.orderCode,
    order_date: dto.transactionAt ? dto.transactionAt.slice(0, 10) : dto.createdAt.slice(0, 10),
    notes: dto.notes ?? undefined,
    status: dto.status === 'ACTIVE' ? 'COMPLETED' : 'CANCELED',
    details: dto.details.map((d: any) => {
      const matched = productMap.get(d.productPublicId);
      return {
        id: String(d.id),
        order_id: dto.orderCode,
        product_id: d.productPublicId,
        transaction_type: d.transactionType,
        quantity: Number(d.quantity),
        unit_cost: 0,
        total_amount: 0,
        product_name: d.productName || matched?.product_name || '',
        unit: matched?.unit || '',
      };
    }),
    created_at: dto.createdAt,
    updated_at: dto.createdAt,
  };
}
```
