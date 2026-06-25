import { Expose, Transform } from 'class-transformer';
import { StockReceiptSourceType, StockReceiptStatus, Voucher } from '@prisma/client';

export class StockReceiptListItemResponseDto {
  @Expose()
  receiptCode!: string;

  @Expose()
  receiptDate!: Date;

  @Expose()
  sourceType!: StockReceiptSourceType;

  @Expose()
  supplierName?: string;

  @Expose()
  sourceInvoiceNo?: string;

  @Expose()
  @Transform(({ value }) => Number(value))
  totalValue!: number;

  @Expose()
  status!: StockReceiptStatus;

  @Expose()
  note?: string;

  @Expose()
  isPaid!: boolean;

  @Expose()
  @Transform(({ obj }) => {
    if (!obj.isPaid) return 'UNPAID';
    const activeVoucher: Voucher = obj.vouchers?.[0];
    return activeVoucher ? activeVoucher.paymentMethod : 'PAID';
  })
  payment!: string;
}
