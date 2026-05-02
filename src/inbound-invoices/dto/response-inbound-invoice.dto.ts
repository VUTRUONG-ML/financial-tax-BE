import { Expose, Transform, Type } from 'class-transformer';
import { InboundInvoiceStatus } from '@prisma/client';

export class InboundDetailResponseDto {
  @Expose()
  id!: number;

  @Expose()
  quantity!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  unitCost!: number;

  @Expose()
  @Transform(({ obj }) => {
    return Number(obj.quantity || 0) * Number(obj.unitCost || 0);
  })
  lineTotal!: number;

  @Expose()
  @Transform(({ obj }) => obj.product?.publicId)
  productPublicId!: string;

  @Expose()
  @Transform(({ obj }) => obj.product?.productName)
  productName!: string; // Trả về tên để UI hiển thị nhanh mà không cần fetch thêm Product
}

export class InboundResponseDto {
  @Expose() publicId!: string;

  // Thông tin người bán
  @Expose() sellerName!: string;
  @Expose() sellerTaxCode!: string;
  @Expose() invoiceNo!: string;
  @Expose() issueDate!: Date;

  // File đính kèm (Ảnh hóa đơn/PDF)
  @Expose() attachmentUrl!: string;

  // Trạng thái kho - Thanh toán
  @Expose() status!: InboundInvoiceStatus;
  @Expose() isSyncedToInventory!: boolean;
  @Expose() isPaid!: boolean;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  totalAmount!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  paidAmount!: number;

  // Trường ảo: Số tiền còn nợ nhà cung cấp
  @Expose()
  @Transform(({ obj }) => {
    const total = Number(obj.totalAmount || 0);
    const paid = Number(obj.paidAmount || 0);
    return Math.max(0, total - paid);
  })
  remainingAmount!: number;

  @Expose() createdAt!: Date;

  // Danh sách chi tiết dòng hàng
  @Expose()
  @Type(() => InboundDetailResponseDto)
  details!: InboundDetailResponseDto[];
}
