import { Expose, Transform } from 'class-transformer';

export class OpeningStockSummaryResponseDto {
  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  totalOpeningValue!: number;

  @Expose()
  openingPeriod!: string;
}

export class OpeningStockListItemDto {
  @Expose()
  @Transform(
    ({ obj }) =>
      (obj as { product?: { productName: string } }).product?.productName,
  )
  productName!: string;

  @Expose()
  @Transform(({ obj }) => (obj as { product?: { unit: string } }).product?.unit)
  unit!: string;

  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  quantity!: number;

  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  unitCost!: number;

  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  totalValue!: number;

  @Expose()
  @Expose()
  @Transform(({ obj }) => (obj as { receipt?: { note: string } }).receipt?.note)
  note!: string | null;
}
