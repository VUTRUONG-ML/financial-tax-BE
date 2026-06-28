import { Exclude, Expose, Transform } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';

@Exclude()
export class RecentTransactionsResponseDto {
  @Expose()
  @Transform(({ obj }) => obj.issueDate ?? obj.createdAt)
  transactionTime!: Date;

  @Expose()
  @Transform(({ obj }) =>
    obj.buyerName?.trim()
      ? `Bán hàng cho ${obj.buyerName}`
      : 'Phiếu bán hàng')
  description!: string;

  @Expose()
  type!: 'INCOME';

  @Expose()
  @Transform(({ obj }) => Number(obj.totalPayment ?? 0))
  totalAmount!: number;

  @Expose()
  status!: InvoiceStatus;
}
