import { Expose, Transform } from 'class-transformer';

export class ExpenseBookRowDto {
  @Expose({ name: 'Ngay_Chi' })
  @Transform(({ obj }) => obj.transactionAt)
  Ngay_Chi!: Date;

  @Expose({ name: 'So_Phieu_Chi' })
  @Transform(({ obj }) => obj.voucherCode)
  So_Phieu_Chi!: string;

  @Expose({ name: 'Hang_Muc' })
  @Transform(({ obj }) => obj.category?.categoryName || '')
  Hang_Muc!: string;

  @Expose({ name: 'Dien_Giai' })
  @Transform(({ obj }) => obj.content)
  Dien_Giai!: string;

  @Expose({ name: 'So_Tien' })
  @Transform(({ obj }) => Number(obj.amount))
  So_Tien!: number;

  @Expose({ name: 'Hoa_Don_Chung_Tu_Kem_Theo' })
  @Transform(
    ({ obj }) =>
      obj.inboundInvoice?.invoiceNo || obj.stockReceipt?.receiptCode || '',
  )
  Hoa_Don_Chung_Tu_Kem_Theo!: string;

  @Expose({ name: 's2cExpenseMapping' })
  @Transform(({ obj }) => obj.category?.s2cExpenseMapping || 'ITEM_F')
  s2cExpenseMapping!: string;
}
