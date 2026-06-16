import { Expose } from 'class-transformer';

export class StockSummaryResponseDto {
  @Expose()
  endingInventoryValue!: number;

  @Expose()
  trackedItemsCount!: number;

  @Expose()
  lowStockItemsCount!: number;
}
