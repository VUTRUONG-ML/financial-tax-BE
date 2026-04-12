export interface JwtPayload {
  sub: string; // ID của user
  phone: string;
  role: string;
  iat?: number; // Issued At (Thời điểm tạo)
  exp?: number; // Expiration (Thời điểm hết hạn)
}
