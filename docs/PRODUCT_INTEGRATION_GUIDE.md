# Hướng dẫn Tích hợp & Giải đáp Mâu thuẫn Module Products (FE ↔ BE)

Tài liệu này nhằm mục đích giải đáp các mâu thuẫn thiết kế giữa Frontend (FE) và Backend (BE), đồng thời hướng dẫn chi tiết cách tích hợp các API mới của module **Products (Hàng hóa/Dịch vụ)**, đặc biệt là endpoint thống kê `/products/summary` và bộ lọc phân loại sản phẩm.

---

## 1. Bản Đồ API Module Products (BE Contract)

Dưới đây là các API chính thức của module Products trên Backend, được bảo vệ bởi `JwtAuthGuard` và `PeriodLockGuard`:

| Chức năng | Method | Endpoint | Content-Type | Mô tả |
| :--- | :---: | :--- | :--- | :--- |
| **Thống kê sản phẩm** | `GET` | `/products/summary` | `application/json` | Trả về tổng sản phẩm, số lượng theo phân loại, tổng giá trị tồn kho, và hàng sắp hết. |
| **Lấy danh sách** | `GET` | `/products` | `application/json` | Lấy danh sách phân trang. Hỗ trợ query `page`, `limit`, và bộ lọc `productType`. |
| **Chi tiết sản phẩm** | `GET` | `/products/:publicId` | `application/json` | Lấy chi tiết thông tin của 1 sản phẩm qua mã `publicId`. |
| **Tạo sản phẩm** | `POST` | `/products` | `multipart/form-data` | Tạo sản phẩm mới kèm tải lên file ảnh (tùy chọn). |
| **Cập nhật** | `PUT` | `/products/:publicId` | `multipart/form-data` | Cập nhật thông tin và/hoặc ảnh sản phẩm mới. |
| **Xóa sản phẩm** | `DELETE` | `/products/:publicId` | `application/json` | Xóa sản phẩm ra khỏi hệ thống. |

> [!WARNING]
> Endpoint `/products/summary` được đặt **trước** endpoint `/products/:publicId` trên hệ thống định tuyến (router) của NestJS để tránh tình trạng từ khóa `summary` bị hiểu nhầm là `publicId` (gây lỗi 404).

---

## 2. Giải Đáp & Hướng Dẫn Khắc Phục Mâu Thuẫn BE ↔ FE

Để đảm bảo tuân thủ nguyên tắc **"Không tự ý thay đổi TypeScript types của Frontend theo cấu trúc Backend"**, FE cần thiết lập một tầng **Mapper (Chuyển đổi dữ liệu)** để chuyển đổi giữa hai hệ thống.

### 2.1. Bản ánh xạ thuộc tính (Field Mapping Table)

| Trường trên Backend | Loại dữ liệu BE | Trường tương ứng trên Frontend | Quy tắc ánh xạ (Mapper Rule) |
| :--- | :---: | :--- | :--- |
| `publicId` | `string` | `id` | `id = dto.publicId` (Khóa ngoại và ID nội bộ hệ thống `id` dạng `number` sẽ bị BE ẩn để bảo mật). |
| `skuCode` | `string` | `sku_code` | `sku_code = dto.skuCode ?? ''` |
| `productName` | `string` | `product_name` | `product_name = dto.productName` |
| `productType` | `enum` | `product_type` | `product_type = dto.productType` |
| `unit` | `string` | `unit` | Giữ nguyên |
| `imageUrl` | `string` | `image_url` | `image_url = dto.imageUrl ?? ''` |
| `currentStock` | `number` | `current_stock` | `current_stock = toSafeNumber(dto.currentStock)` |
| `openingStockQuantity`| `number` | `opening_stock_quantity` | `opening_stock_quantity = toSafeNumber(dto.openingStockQuantity)` |
| `sellingPrice` | `number` | `selling_price` | `selling_price = toSafeNumber(dto.sellingPrice)` |
| `openingStockUnitCost`| `number` | `opening_stock_unit_cost` | `opening_stock_unit_cost = toSafeNumber(dto.openingStockUnitCost)` |
| `openingStockValue` | `number` | `opening_stock_value` | `opening_stock_value = toSafeNumber(dto.openingStockValue)` |
| `createdAt` | `string` | `created_at` | `created_at = dto.createdAt` |
| _Không có_ | _N/A_ | `user_id` | **Fallback:** Gán giá trị mặc định là `'current-user'` hoặc ID người dùng hiện tại từ Auth Store. |
| _Không có_ | _N/A_ | `current_avg_cost` | **Fallback:** Gán bằng giá trị đầu kỳ `openingStockUnitCost ?? 0` (vì BE tính toán giá vốn trung bình động theo thời gian thực tại các Sổ Kế Toán, không lưu cache tĩnh trong bảng Product). |

---

### 2.2. Chi tiết giải đáp các điểm mâu thuẫn lớn

#### 1. Xử lý các từ khóa sai lệch (Typo Tolerance) cho `productType`
Backend hỗ trợ cơ chế tự động chuyển đổi và sửa lỗi chính tả không phân biệt hoa thường khi nhận query parameter hoặc request body để đưa về các giá trị chuẩn:
* **`FINISHED_GOOD`** (Hệ thống tự động sửa đổi nếu gửi thiếu chữ "ED" như `FINISH_GOOD`)
* **`RAW_MATERIAL`** (Hệ thống tự động sửa đổi nếu gửi sai chính tả như `RAW_METARIAL`)
* **`SERVICE`**

> [!TIP]
> Frontend có thể gửi các giá trị chính xác (`FINISHED_GOOD`, `RAW_MATERIAL`, `SERVICE`) hoặc các biến thể cũ, BE sẽ tự động phân loại đúng đắn và an toàn mà không ném lỗi.

#### 2. Dữ liệu rỗng đối với Hàng hóa dịch vụ (`SERVICE`)
* Đối với loại sản phẩm là `SERVICE` (Dịch vụ): Tồn kho không áp dụng.
* **Quy tắc mapping trên FE:** Nếu `productType === 'SERVICE'`, hãy tự động gán các trường tồn kho (`currentStock`, `openingStockQuantity`, `openingStockUnitCost`, `openingStockValue`) về `null` hoặc `0` trên giao diện người dùng.

#### 3. Cơ chế tải ảnh sản phẩm lên Cloudinary
* **Tạo mới/Cập nhật:** Khi người dùng tải ảnh lên, FE không gửi chuỗi Base64 hay URL ảnh, mà phải đính kèm file nhị phân vào trường `file` trong đối tượng `FormData`.
* **Cập nhật không thay đổi ảnh:** Nếu người dùng sửa thông tin sản phẩm nhưng không đổi ảnh $\rightarrow$ **Không truyền** thuộc tính `file` trong `FormData`, BE sẽ giữ nguyên ảnh cũ.
* **Xóa ảnh:** BE v1 chưa hỗ trợ xóa ảnh hoàn toàn (về trạng thái không có ảnh). Thay vào đó, ảnh cũ sẽ tự động bị dọn dẹp trên Cloudinary khi người dùng tải lên một file ảnh mới thay thế.

#### 4. Quy trình tính toán Giá vốn bình quân gia quyền (`current_avg_cost`)
Hệ thống áp dụng thuật toán Giá vốn bình quân gia quyền tính lũy kế theo từng đợt biến động kho để cập nhật đơn giá của sản phẩm:
* **Thuật toán & Ví dụ:**
  $$\text{Đơn giá bình quân} = \frac{\text{Tổng giá trị tồn kho trước biến động} + \text{Tổng giá trị nhập mới}}{\text{Tổng số lượng tồn kho sau biến động}}$$
  *Ví dụ:*
  - Lô 1: Nhập vào 10 sản phẩm có giá 100k = 1.000.000đ.
  - Lô 2: Nhập thêm 10 sản phẩm có giá 200k = 2.000.000đ.
  - Giá vốn bình quân hiện tại (`current_avg_cost`) = 3.000.000đ / 20 sản phẩm = 150.000đ.

* **Hoạt động liên kết giữa các Module:**
  1. **Hóa đơn mua vào (`inbound-invoices`):**
     - Ở góc giao diện có checkbox `[x] Cập nhật số lượng vào Tồn kho`. Khi lưu hóa đơn có kích hoạt checkbox này, Backend sẽ đồng thời cộng dồn số lượng vào `currentStock` trong bảng `Product`, đồng thời tính toán lại đơn giá tồn kho theo thuật toán Bình quân gia quyền và lưu lại để làm cơ sở tính giá vốn xuất kho sau này.
  2. **Lệnh sản xuất nội bộ (`internal-production-orders`):**
     - **Giao diện:** UI tuyệt đối không hiển thị các cột Đơn giá/Thành tiền để tránh người dùng nhập sai lệch.
     - **Backend Auto-Costing (Giá vốn tự động):** Khi người dùng lưu Lệnh sản xuất, Backend sẽ tự động lấy đơn giá bình quân gia quyền hiện thời của các nguyên liệu xuất đi (Khối 1) $\rightarrow$ Tính tổng giá trị mẻ sản xuất $\rightarrow$ Chia đều cho số lượng thành phẩm thu về (Khối 2) để tự động ra Đơn giá thành phẩm và lưu ngầm vào Database.

---

## 3. Đặc tả Chi tiết API Mới & Cập Nhật

### 3.1. Thống Kê Tổng Quan Sản Phẩm (GET `/products/summary`)

Trả về các chỉ số thống kê kho hàng tổng hợp của hộ kinh doanh.

* **Method:** `GET`
* **Route:** `/products/summary`
* **Response Body (JSON):**
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T07:31:59.000Z",
  "message": "Product summary retrieved successfully.",
  "data": {
    "tong_san_pham": 42,
    "tong_san_pham_phan_loai": {
      "FINISHED_GOOD": 25,
      "RAW_MATERIAL": 0,
      "SERVICE": 5
    },
    "tong_gia_tri_ton_kho": 125000000.5,
    "sap_het_hang": 4
  },
  "meta": null
}
```

#### Ý nghĩa các trường dữ liệu:
1. `tong_san_pham`: Tổng số lượng tất cả sản phẩm của user hiện tại.
2. `tong_san_pham_phan_loai`: Số lượng sản phẩm được chia nhóm theo phân loại (`FINISHED_GOOD`, `SERVICE` - `RAW_MATERIAL` hiện đã bị loại bỏ và luôn trả về `0`).
3. `tong_gia_tri_ton_kho`: Tổng giá trị tồn kho hiện thời của các sản phẩm vật lý (Tính bằng công thức: $\sum (\text{currentStock} \times \text{openingStockUnitCost})$ cho toàn bộ sản phẩm **không phải** `SERVICE`).
4. `sap_het_hang`: Tổng số lượng sản phẩm vật lý đang ở mức báo động (Số lượng tồn kho `currentStock < 15`, loại trừ `SERVICE`).

---

### 3.2. Lấy Danh Sách Sản Phẩm (GET `/products`)

Endpoint này đã được cập nhật thêm bộ lọc theo phân loại sản phẩm.

* **Method:** `GET`
* **Route:** `/products?page=1&limit=20&productType=FINISHED_GOOD`
* **Query Parameters:**
  * `page` (Optional): Số trang hiện tại (Default: `1`).
  * `limit` (Optional): Số phần tử trên một trang (Default: `20`).
  * `productType` (Optional): Lọc danh sách theo loại sản phẩm. Sử dụng giá trị chuẩn: `FINISHED_GOOD` và `SERVICE` (hệ thống hỗ trợ sửa lỗi chính tả nếu vô tình gửi `FINISH_GOOD`).
* **Response Body (JSON):**
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-05-28T07:31:59.000Z",
  "message": "Products retrieved successfully.",
  "data": [
    {
      "publicId": "prod-abc123xyz",
      "skuCode": "SKU-FG-001",
      "productName": "Sản phẩm hoàn thiện A",
      "productType": "FINISHED_GOOD",
      "unit": "Cái",
      "imageUrl": "https://res.cloudinary.com/.../prod-abc123xyz.jpg",
      "currentStock": 50,
      "openingStockQuantity": 20,
      "sellingPrice": 150000,
      "openingStockUnitCost": 100000,
      "openingStockValue": 2000000,
      "createdAt": "2026-05-20T08:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "lastPage": 1
  }
}
```

---

## 4. Hướng Dẫn Viết Mã Mapper Khuyến Nghị trên Frontend

Dưới đây là gợi ý viết hàm Mapper bằng TypeScript trên Frontend để đảm bảo dữ liệu chạy mượt mà, đúng chuẩn SRS mà không bị lỗi kiểu dữ liệu:

```typescript
// 1. Định nghĩa kiểu dữ liệu cho Frontend khớp với SRS / Mock cũ
export interface ProductFE {
  id: string;
  sku_code: string;
  product_name: string;
  product_type: 'FINISHED_GOOD' | 'SERVICE';
  unit: string;
  image_url: string;
  current_stock: number | null;
  opening_stock_quantity: number | null;
  selling_price: number;
  opening_stock_unit_cost: number | null;
  opening_stock_value: number | null;
  created_at: string;
  user_id: string;
  current_avg_cost: number | null;
}

// Helper an toàn để chuyển đổi kiểu số
const toSafeNumber = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// 2. Hàm Mapper chính: Chuyển DTO từ Backend sang Entity Frontend
export function mapProductBEToFE(dto: any): ProductFE {
  const isService = dto.productType === 'SERVICE';
  
  return {
    id: dto.publicId,
    sku_code: dto.skuCode ?? '',
    product_name: dto.productName,
    product_type: dto.productType,
    unit: dto.unit,
    image_url: dto.imageUrl ?? '',
    created_at: dto.createdAt,
    selling_price: toSafeNumber(dto.sellingPrice),
    
    // Gán null cho các trường tồn kho nếu là loại Dịch vụ (SERVICE)
    current_stock: isService ? null : toSafeNumber(dto.currentStock),
    opening_stock_quantity: isService ? null : toSafeNumber(dto.openingStockQuantity),
    opening_stock_unit_cost: isService ? null : toSafeNumber(dto.openingStockUnitCost),
    opening_stock_value: isService ? null : toSafeNumber(dto.openingStockValue),
    
    // Fallback cho các trường FE yêu cầu nhưng BE lược bỏ / tính động
    user_id: 'current-user',
    current_avg_cost: isService ? null : toSafeNumber(dto.openingStockUnitCost),
  };
}

// 3. Hàm Mapper ngược: Chuyển dữ liệu Form sang FormData gửi lên Backend
export function mapProductFormToFormData(formValues: any): FormData {
  const formData = new FormData();
  
  formData.append('productName', formValues.product_name);
  formData.append('productType', formValues.product_type);
  formData.append('unit', formValues.unit);
  formData.append('sellingPrice', String(toSafeNumber(formValues.selling_price)));
  
  if (formValues.sku_code) {
    formData.append('skuCode', formValues.sku_code);
  }
  
  if (formValues.product_type !== 'SERVICE') {
    formData.append('openingStockQuantity', String(toSafeNumber(formValues.opening_stock_quantity)));
    formData.append('openingStockUnitCost', String(toSafeNumber(formValues.opening_stock_unit_cost)));
  } else {
    formData.append('openingStockQuantity', '0');
    formData.append('openingStockUnitCost', '0');
  }
  
  // Đính kèm file nhị phân nếu người dùng chọn ảnh mới
  if (formValues.image_file instanceof File) {
    formData.append('file', formValues.image_file);
  }
  
  return formData;
}
```

Bằng cách áp dụng cấu trúc trên, Frontend hoàn toàn có thể yên tâm đồng bộ dữ liệu với Backend mà không sợ phát sinh lỗi không tương thích.
