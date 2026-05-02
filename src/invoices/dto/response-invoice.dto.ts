import { InvoiceStatus } from '@prisma/client';
import { Expose, Transform, Type } from 'class-transformer';

export class InvoiceDetailResponseDto {
  @Expose()
  id!: number; // Giữ lại ID này để làm key render list

  @Expose()
  productNameSnapshot!: string;

  @Expose()
  quantity!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  unitPrice!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  totalAmount!: number;

  // Không lộ productId gốc, chỉ lộ PublicId của sản phẩm nếu cần link
  @Expose()
  @Transform(({ obj }) => obj.product?.publicId)
  productPublicId!: string;
}

export class InvoiceResponseDto {
  @Expose()
  publicId!: string; // Dùng làm định danh thay cho ID

  @Expose()
  invoiceSymbol!: string;

  @Expose()
  isB2C!: boolean;

  @Expose()
  buyerName!: string;

  @Expose()
  buyerTaxCode!: string;

  @Expose()
  buyerAddress!: string;

  @Expose()
  status!: InvoiceStatus;

  @Expose()
  isPaid!: boolean;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  totalPayment!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  paidAmount!: number;

  @Expose()
  cqtCode!: string; // Mã của cơ quan thuế

  @Expose()
  issuedAt!: Date;

  @Expose()
  createdAt!: Date;

  // Nhúng danh sách chi tiết hóa đơn
  @Expose()
  @Type(() => InvoiceDetailResponseDto)
  details!: InvoiceDetailResponseDto[];

  @Expose()
  @Transform(({ obj }) => {
    // Tính số tiền còn nợ (Total - Paid) để Frontend hiển thị nhanh
    const total = Number(obj.totalPayment || 0);
    const paid = Number(obj.paidAmount || 0);
    return Math.max(0, total - paid);
  })
  remainingAmount!: number;
}
