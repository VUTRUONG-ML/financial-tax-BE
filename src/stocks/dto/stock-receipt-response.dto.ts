import { Expose, Transform, Type } from 'class-transformer';
import { StockReceiptSourceType, StockReceiptStatus } from '@prisma/client';

export class StockReceiptDetailResponseDto {
  @Expose()
  @Transform(
    ({ obj }) => (obj as { product?: { publicId: string } }).product?.publicId,
  )
  productPublicId!: string;

  @Expose()
  @Transform(
    ({ obj }) =>
      (obj as { product?: { productName: string } }).product?.productName,
  )
  productName!: string;

  @Expose()
  @Transform(
    ({ obj }) => (obj as { product?: { skuCode?: string } }).product?.skuCode,
  )
  skuCode!: string;

  @Expose()
  @Transform(({ value }) => Number(value))
  quantity!: number;

  @Expose()
  @Transform(({ value }) => Number(value))
  unitCost!: number;

  @Expose()
  @Transform(({ value }) => Number(value))
  totalValue!: number;

  @Expose()
  taxCategoryIdSnapshot?: number;
}

export class StockReceiptResponseDto {
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
  sourceDocumentUrl?: string;

  @Expose()
  @Transform(({ value }) => Number(value))
  totalValue!: number;

  @Expose()
  status!: StockReceiptStatus;

  @Expose()
  @Transform(
    ({ obj }) =>
      (obj as { period?: { periodName?: string } }).period?.periodName,
  )
  periodName!: string;

  @Expose()
  createdAt!: Date;

  @Expose()
  note?: string;

  @Expose()
  isPaid!: boolean;

  @Expose()
  @Type(() => StockReceiptDetailResponseDto)
  details!: StockReceiptDetailResponseDto[];
}
