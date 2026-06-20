# 📑 Hướng Dẫn Tích Hợp API Authentication & Onboarding (Dành cho Frontend)

Tài liệu này hướng dẫn chi tiết cách Frontend (FE) tích hợp hệ thống Authentication (Auth), cơ chế tự động khôi phục phiên làm việc (Silent Token Refresh) qua Axios, và luồng thiết lập cấu hình thuế ban đầu (Onboarding) của hệ thống.

---

## 1. Luồng Tích Hợp Hệ Thống Authentication & Session Recovery

Hệ thống sử dụng cơ chế bảo mật kết hợp giữa **Access Token** ngắn hạn và **Refresh Token** dài hạn để vừa đảm bảo an toàn, vừa mang lại trải nghiệm mượt mà cho người dùng.

### 1.1 Cơ chế quản lý Token

- **Access Token (Hạn dùng: 15 phút)**:
  - Trả về trực tiếp trong payload của API đăng nhập (`accessToken`).
  - Được lưu trữ ở bộ nhớ tạm (state/memory của FE) hoặc `localStorage`.
  - Được gửi kèm theo mọi Request cần bảo mật thông qua Header: `Authorization: Bearer <access_token>`.
- **Refresh Token (Hạn dùng: 7 ngày)**:
  - Được backend tự động lưu trữ trong **HttpOnly Cookie** bảo mật của trình duyệt (thông qua header `Set-Cookie`).
  - FE **không thể** truy cập cookie này bằng JavaScript để tránh tấn công XSS.
  - Trình duyệt sẽ tự động gửi kèm cookie này khi gọi API `/v1/auth/refresh`. Để kích hoạt tính năng này trong Axios, FE phải cấu hình option `withCredentials: true`.

---

### 1.2 Luồng Logic Tự Động Refresh Token (Axios Interceptors)

Để đảm bảo người dùng không bị gián đoạn phiên làm việc khi Access Token hết hạn, FE cần cấu hình cơ chế tự động làm mới token (Silent Refresh) bằng Axios Interceptor theo sơ đồ sau:

```
[ FE Request ] ──(Đính kèm Bearer Token)──► [ Backend ]
     ▲                                           │
     │ (Thành công - 2xx)                        │
     ├───────────────────────────────────────────┼──► Trả kết quả dữ liệu
     │                                           │
     │ (Lỗi 401 Unauthorized)                    ▼
     │ ◄─────────────────────────────────────────┘
     ▼
[ Kiểm tra nguyên nhân lỗi ]
     │
     ├──► Không phải do hết hạn token (Invalid Token) ──► Đăng xuất (Logout) & Chuyển sang /login
     │
     └──► Do hết hạn token ('ACCESS_TOKEN_EXPIRED')
             │
             ▼
      [ Gửi yêu cầu POST /v1/auth/refresh ]
             │
             ├──► Thất bại (401/400 - Refresh Token hết hạn) ──► Xóa dữ liệu cũ, Đăng xuất & Chuyển sang /login
             │
             └──► Thành công (Nhận Access Token mới)
                     │
                     ├─► Cập nhật Access Token mới vào bộ nhớ
                     └─► Tự động gửi lại (Retry) Request ban đầu với Token mới
```

#### Xử lý hàng đợi Request (Request Queueing)

Trong ứng dụng thực tế, khi một trang web tải, nó có thể gửi đồng thời nhiều API Request (ví dụ: lấy profile, lấy danh sách sản phẩm, lấy thông tin kỳ tài chính). Khi token hết hạn, tất cả các request này đều sẽ bị trả về lỗi `401`.

**Nguyên tắc thiết kế**:

1. Chỉ thực hiện **1 request duy nhất** đến API `/v1/auth/refresh` tại một thời điểm để lấy token mới.
2. Dùng một biến cờ `isRefreshing` để đánh dấu trạng thái đang refresh.
3. Các request bị lỗi 401 tiếp theo sẽ được đẩy vào một hàng đợi (queue) dưới dạng các Promise chờ giải quyết.
4. Khi có access token mới, duyệt qua hàng đợi và giải phóng các request đó bằng access token mới.
5. Nếu refresh token thất bại, từ chối toàn bộ các request trong hàng đợi và chuyển hướng người dùng đến trang đăng nhập.

---

## 2. Luồng Nghiệp Vụ Onboarding & Cấu Hình Thuế

Onboarding là quy trình bắt buộc đối với người dùng mới đăng ký để thiết lập cấu hình thuế suất và phương pháp tính thuế của hộ kinh doanh trước khi sử dụng bất kỳ tính năng nào khác của hệ thống.

### 2.1 Logic Bắt Buộc Onboarding (Route Guard)

- Khi người dùng đăng nhập thành công hoặc khi ứng dụng khởi chạy, FE gọi API lấy thông tin cá nhân (`GET /v1/auth/profile`).
- FE cần kiểm tra giá trị trường `setUpCompletedAt` trong đối tượng `user`:
  - **Nếu `setUpCompletedAt === null`**: Người dùng chưa hoàn thành thiết lập. FE phải chặn toàn bộ quyền truy cập vào các trang chính (Dashboard, Hàng hóa, Hóa đơn, Sổ sách...) và chuyển hướng bắt buộc người dùng đến màn hình **/onboarding** (trang thiết lập thuế).
  - **Nếu `setUpCompletedAt !== null`**: Người dùng đã cấu hình thuế thành công. Cho phép truy cập bình thường.

---

### 2.2 Quy trình Tích hợp API Onboarding Wizard

Quy trình thiết lập thuế gồm 3 bước tích hợp chính:

#### Bước 1: Tải dữ liệu gợi ý (Metadata Init)

- FE gọi API public không yêu cầu token: `GET /v1/metadata/onboarding-init`.
- Dữ liệu nhận về gồm danh sách các Ngành nghề gợi ý (`industries`) và các Nhóm thuế pháp lý tương ứng (`taxGroups`).

#### Bước 2: Hiển thị giao diện và điều hướng lựa chọn

- **Lựa chọn Ngành nghề**: Hiển thị danh sách các tag ngành nghề dưới dạng nút chọn nhanh.
  - Nếu người dùng không tìm thấy ngành nghề phù hợp, hiển thị tùy chọn **"Ngành nghề khác"** (khi gửi payload truyền `isOtherIndustry: true`).
- **Chọn Nhóm thuế & Phương pháp tính thuế**:
  - Dựa vào ngành nghề đã chọn, FE tìm kiếm nhóm thuế tương ứng của ngành đó trong dữ liệu `taxGroups`.
  - **Lưu ý quan trọng**: Frontend **không cần** hiển thị hộp chọn phương pháp tính thuế (PIT Method) cho người dùng. Phương pháp tính thuế sẽ được Backend tự động xác định mặc định dựa trên `taxGroupId` được gửi lên (Ví dụ: Nhóm 1 tự động chọn `EXEMPT`, Nhóm 2 tự động chọn `PERCENTAGE`, Nhóm 3 chọn `PROFIT_17`, Nhóm 4 chọn `PROFIT_20`). Do đó, payload gửi lên từ FE cả khi setup hay update đều không có trường `pitMethod`.

#### Bước 3: Lưu cấu hình ban đầu

- Gửi dữ liệu lựa chọn lên API `POST /v1/onboarding/tax-config`.
- Sau khi thành công, Backend sẽ cập nhật thông tin user, kích hoạt trường `setUpCompletedAt` và trả về thông tin cấu hình chi tiết (gồm cả snapshot thuế suất GTGT, thuế suất TNCN thực tế được áp dụng).
- FE nhận kết quả thành công sẽ mở khóa Route Guard và chuyển hướng người dùng về Dashboard.

---

### 2.3 Cập Nhật Cấu Hình Thuế (Update Config) & Cảnh báo Cooldown 90 ngày

Khi người dùng muốn thay đổi cấu hình thuế (thay đổi ngành nghề, nhóm thuế hoặc phương pháp kê khai) sau này, họ sẽ sử dụng API `PUT /v1/onboarding/tax-config`.

#### Quy tắc Cooldown 90 Ngày:

Hệ thống quản lý thuế quy định cấu hình thuế chỉ được thay đổi định kỳ theo quý. Do đó, Backend áp dụng giới hạn thời gian (cooldown) là **90 ngày** (`TAX_QUARTER_COOLDOWN_MS`).

- Khoảng cách giữa thời gian hiện tại và ngày áp dụng cấu hình cũ (`applyFromDate`) phải **lớn hơn hoặc bằng 90 ngày** thì mới được phép cập nhật.
- Nếu chưa đủ 90 ngày, Backend sẽ chặn lại và trả về lỗi `400 Bad Request` kèm mã log lỗi `USER_UPDATE_BEFORE_PERIOD`.

#### Yêu cầu tích hợp trên Frontend:

1. **Thiết kế Modal Xác Nhận**: Khi người dùng nhấn nút "Cập nhật cấu hình", FE **bắt buộc** không được gọi API ngay mà phải hiển thị một hộp thoại (Modal) cảnh báo với nội dung:
   > ⚠️ **Cảnh báo thay đổi cấu hình thuế**
   >
   > Cấu hình thuế chỉ được cập nhật định kỳ mỗi 90 ngày (đầu kỳ tính thuế). Sau khi xác nhận thay đổi, bạn sẽ không thể chỉnh sửa lại cấu hình này trong vòng 3 tháng tiếp theo.
   >
   > Bạn có chắc chắn muốn thực hiện cập nhật này không?
   >
   > `[ Hủy bỏ ]` `[ Tôi xác nhận cập nhật ]`
2. **Xử lý Lỗi Cooldown**: Nếu người dùng bấm Xác nhận nhưng API trả về lỗi do vi phạm cooldown, FE cần bắt lỗi cụ thể để hiển thị Toast thông báo lỗi rõ ràng thay vì thông báo lỗi chung chung:
   - **Mã lỗi Backend**: `400 Bad Request`
   - **Nội dung lỗi**: `"You are only allowed to change your tax configuration at the beginning of the period."`
   - **Mã lỗi nội bộ (ErrorCode)**: `USER_UPDATE_BEFORE_PERIOD`
   - **Hành động FE**: Đóng Modal xác nhận và hiển thị Toast thông báo: _"Thay đổi thất bại: Cấu hình thuế của bạn chưa đủ thời gian 90 ngày tối thiểu để cập nhật lại."_

---

## 3. Đặc Tả Chi Tiết API Request/Response (TypeScript Type)

Dưới đây là các định nghĩa kiểu dữ liệu (TypeScript Interfaces) cho luồng Auth và Onboarding, được trích xuất từ cấu trúc thực tế của Backend.

### 3.1 Cấu trúc Wrapper chuẩn của hệ thống

Tất cả các API trả về từ server đều được bọc chung bởi một cấu trúc chuẩn:

```typescript
export interface ApiResponseWrapper<T> {
  success: boolean;
  statusCode: number;
  timestamp: string; // ISO 8601 Date string
  message: string;
  data: T;
  meta: {
    total?: number;
    page?: number;
    lastPage?: number;
  } | null;
}

export interface ApiErrorPayload {
  success: boolean;
  statusCode: number;
  message: string;
  errorCode?: string; // Ví dụ: 'ACCESS_TOKEN_EXPIRED', 'USER_UPDATE_BEFORE_PERIOD'
  data?: any;
}
```

### 3.2 Các API Authentication

#### 1. Đăng ký tài khoản (`POST /v1/auth/register`)

- **Yêu cầu đăng nhập**: Không
- **Mô tả kiểu Request & Response**:

```typescript
export interface RegisterRequest {
  phoneNumber: string; // Số điện thoại đăng nhập
  password: string; // Mật khẩu bảo mật
  taxCode: string; // Mã số thuế của hộ kinh doanh
  businessName: string; // Tên hộ kinh doanh
  ownerName: string; // Tên người đại diện / chủ hộ
  cccdNumber: string; // Số CCCD
  provinceCity: string; // Tỉnh/Thành phố hoạt động
}

export interface UserProfileDto {
  id: string;
  phone: string;
  role: 'ADMIN' | 'STAFF';
  tax_code: string;
  cccd_number: string;
  business_name: string;
  representative: string;
  industry: string;
  industry_label: string;
  tax_group: number;
  setUpCompletedAt: string | null; // ISO Date string, null nếu chưa hoàn tất onboarding
  created_at: string; // ISO Date string
}

export type RegisterResponse = ApiResponseWrapper<UserProfileDto>;
```

#### 2. Đăng nhập (`POST /v1/auth/login`)

- **Yêu cầu đăng nhập**: Không
- **Mô tả kiểu Request & Response**:

```typescript
export interface LoginRequest {
  phoneNumber: string;
  password: string;
}

export interface LoginResponseData {
  user: UserProfileDto;
  accessToken: string; // Token dùng cho Authorization Header
}

export type LoginResponse = ApiResponseWrapper<LoginResponseData>;
// Note: Refresh token được lưu ngầm trong HttpOnly Cookie
```

#### 3. Lấy thông tin tài khoản hiện tại (`GET /v1/auth/profile`)

- **Yêu cầu đăng nhập**: Có (Bearer Token)
- **Mô tả kiểu Response**:

```typescript
export type GetProfileResponse = ApiResponseWrapper<UserProfileDto>;
```

#### 4. Làm mới Access Token (`POST /v1/auth/refresh`)

- **Yêu cầu đăng nhập**: Có (Tự động gửi kèm Cookie refresh_token)
- **Mô tả kiểu Response**:

```typescript
export interface RefreshTokenResponseData {
  accessToken: string;
}

export type RefreshTokenResponse = ApiResponseWrapper<RefreshTokenResponseData>;
```

#### 5. Đăng xuất (`POST /v1/auth/logout`)

- **Yêu cầu đăng nhập**: Có (Bearer Token & Cookie refresh_token)
- **Mô tả kiểu Response**:

```typescript
export interface LogoutResponseData {
  userId: string;
}

export type LogoutResponse = ApiResponseWrapper<LogoutResponseData>;
```

---

### 3.3 Các API Onboarding

#### 1. Lấy dữ liệu gợi ý ban đầu (`GET /v1/metadata/onboarding-init`)

- **Yêu cầu đăng nhập**: Không
- **Mô tả kiểu Response**:

```typescript
export interface IndustryTagDto {
  id: number;
  tagName: string;
  iconName: string | null;
  mappedTaxId: number;
}

export interface TaxGroupDto {
  id: number;
  groupName: string;
  minRevenue: number;
  maxRevenue: number | null;
  description: string | null;
  allowedMethods: (
    | 'EXEMPT'
    | 'PERCENTAGE'
    | 'PROFIT_15'
    | 'PROFIT_17'
    | 'PROFIT_20'
  )[];
}

export interface OnboardingInitData {
  industries: IndustryTagDto[];
  taxGroups: TaxGroupDto[];
}

export type OnboardingInitResponse = ApiResponseWrapper<OnboardingInitData>;
```

#### 2. Thiết lập cấu hình thuế ban đầu (`POST /v1/onboarding/tax-config`)

- **Yêu cầu đăng nhập**: Có (Bearer Token)
- **Mô tả kiểu Request & Response**:

```typescript
export interface SetupTaxConfigRequest {
  industryId: number;
  taxGroupId: number;
  isOtherIndustry?: boolean; // Mặc định false
  isVatReducible?: boolean; // Mặc định false Hiện logic này chưa xử lý
}

export interface TaxConfigurationDto {
  id: string;
  userId: string;
  industryId: number;
  taxGroupId: number;
  chosenPitMethod:
    | 'EXEMPT'
    | 'PERCENTAGE'
    | 'PROFIT_15'
    | 'PROFIT_17'
    | 'PROFIT_20';
  applyFromDate: string; // ISO Date
  applyToDate: string | null;
  vatRateSnapShot: number; // Thuế suất GTGT áp dụng thực tế
  pitRateSnapShot: number; // Thuế suất TNCN áp dụng thực tế
  isVatReducible: boolean;
  createdAt: string; // ISO Date
  updatedAt: string; // ISO Date
}

export type SetupTaxConfigResponse = ApiResponseWrapper<TaxConfigurationDto>;
```

#### 3. Cập nhật cấu hình thuế (`PUT /v1/onboarding/tax-config`)

- **Yêu cầu đăng nhập**: Có (Bearer Token)
- **Mô tả kiểu Request & Response**:

```typescript
export interface UpdateTaxConfigRequest {
  industryId: number;
  taxGroupId: number;
  isOtherIndustry?: boolean;
  isVatReducible?: boolean; // logic này chưa xử lý
}

export type UpdateTaxConfigResponse = ApiResponseWrapper<TaxConfigurationDto>;
```

---

## 4. Thiết Kế Hướng Dẫn Cấu Hình Axios Client (Conceptual Logic)

Để tích hợp, bạn cần thiết lập một Axios client hoạt động theo mô hình cấu hình dưới đây.

### Bước 4.1: Cấu hình Client cơ bản

- Khởi tạo thực thể Axios (Axios Instance) với `baseURL` của backend.
- Cấu hình header mặc định là `Content-Type: application/json`.
- Thiết lập `withCredentials: true` để gửi kèm cookie HttpOnly (chứa refresh token) trong các request tự động.

### Bước 4.2: Request Interceptor (Đính kèm Access Token)

- Đăng ký một interceptor cho các yêu cầu đi (request).
- Trước khi request được gửi đi, kiểm tra xem bộ nhớ cục bộ (ví dụ: LocalStorage) có chứa `accessToken` hay không.
- Nếu có, đính kèm vào header: `Authorization: Bearer <accessToken>`.

### Bước 4.3: Response Interceptor (Tự động Silent Refresh & Retry)

- Đăng ký một interceptor cho các phản hồi nhận về (response).
- Nếu phản hồi trả về thành công (HTTP Status 2xx), trả kết quả bình thường.
- Nếu phát hiện lỗi (HTTP Status 401 - Unauthorized):
  1. Trích xuất mã lỗi nghiệp vụ hoặc nội dung thông báo lỗi từ backend.
  2. Nếu phát hiện mã lỗi là `ACCESS_TOKEN_EXPIRED` (hoặc thông báo lỗi chứa chữ `'token expired'`) **VÀ** request này chưa từng được thử lại lần nào:
     - Chuyển trạng thái sang `isRefreshing = true`.
     - Kích hoạt yêu cầu gọi API làm mới: `POST /v1/auth/refresh` (Truyền `withCredentials: true` để trình duyệt tự đính kèm cookie chứa refresh token).
     - **Nếu lấy Access Token mới thành công**:
       - Cập nhật access token mới vào LocalStorage/Memory.
       - Thực hiện gọi lại (Retry) request ban đầu với Authorization header mới.
       - Giải phóng các request khác đang đợi trong hàng đợi bằng token mới.
       - Đặt lại cờ `isRefreshing = false`.
     - **Nếu lấy Access Token mới thất bại (Refresh Token hết hạn)**:
       - Từ chối tất cả các request đang đợi.
       - Xóa thông tin đăng nhập cũ trong LocalStorage.
       - Chuyển hướng người dùng về trang đăng nhập `/login`.
  3. Nếu gặp lỗi 401 nhưng không phải lỗi hết hạn access token (ví dụ: token sai, không hợp lệ), thực hiện đăng xuất ngay lập tức để bảo vệ hệ thống.

_Lưu ý: FE cần chuẩn bị cơ chế lưu trữ hàng đợi (Queue) các request bị chặn trong thời gian hệ thống đang chờ API refresh token trả về kết quả._
