// src/vouchers/dto/voucher-response.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { VoucherType, PaymentMethod, VoucherStatus } from '@prisma/client';
import { VoucherCategoryResponseDto } from '../../voucher-categories/dto/response-voucher-category.dto';

export class VoucherResponseDto {
  @Expose() voucherCode!: string; // Định danh chính
  @Expose() voucherType!: VoucherType;
  @Expose() transactionAt!: Date;
  @Expose() content!: string;
  @Expose() paymentMethod!: PaymentMethod;
  @Expose() isDeductibleExpense!: boolean;
  @Expose() status!: VoucherStatus;
  @Expose() createdAt!: Date;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  amount!: number;

  // Map thông tin Category
  @Expose()
  @Type(() => VoucherCategoryResponseDto)
  category!: VoucherCategoryResponseDto;

  // Liên kết Inbound Invoice (Hóa đơn đầu vào)
  @Expose()
  @Transform(({ obj }) => obj.inboundInvoice?.publicId)
  inboundInvoicePublicId!: string;

  @Expose()
  @Transform(({ obj }) => obj.inboundInvoice?.invoiceNo)
  inboundInvoiceNo!: string;

  // Liên kết Outbound Invoice (Hóa đơn bán ra)
  @Expose()
  @Transform(({ obj }) => obj.outBoundInvoice?.publicId)
  outboundInvoicePublicId!: string;

  @Expose()
  @Transform(({ obj }) => obj.outBoundInvoice?.invoiceSymbol)
  outboundInvoiceSymbol!: string;
}
