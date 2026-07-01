import {
  CustomerType,
  DeclarationActivityType,
  InvoiceStatus,
  PaymentMethod,
  ProductType,
} from '@prisma/client';
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

  @Expose()
  unit!: string;

  @Expose()
  productType!: ProductType;
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
  buyerPhone!: string;

  @Expose()
  buyerNote!: string;

  @Expose()
  customerType!: CustomerType;

  @Expose()
  declarationActivityType!: DeclarationActivityType;

  @Expose()
  businessLocationCode!: string;

  @Expose()
  businessLocationName!: string;

  @Expose()
  status!: InvoiceStatus;

  @Expose()
  @Transform(({ obj }) => {
    return obj.status === 'ISSUED';
  })
  isPaid!: boolean;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  totalPayment!: number;

  @Expose()
  @Transform(({ obj }) => {
    return obj.status === 'ISSUED' ? Number(obj.totalPayment || 0) : 0;
  })
  paidAmount!: number;

  @Expose()
  cqtCode!: string; // Mã của cơ quan thuế

  @Expose()
  paymentMethod!: PaymentMethod;

  @Expose()
  buyerEmail!: string;

  @Expose()
  buyerIdNumber!: string;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  taxRate!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  taxPayable!: number;

  @Expose()
  cancellationReason!: string;

  @Expose()
  issueDate!: Date;

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
    const paid = obj.status === 'ISSUED' ? total : 0;
    return Math.max(0, total - paid);
  })
  remainingAmount!: number;
}
