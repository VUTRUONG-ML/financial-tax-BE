import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockIssuesController } from './stock-issues.controller';
import { StocksService } from './stocks.service';
import { InventoryMovementsModule } from '../inventory-movements/inventory-movements.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  imports: [InventoryMovementsModule, VouchersModule],
  controllers: [
    StocksController,
    StockReceiptsController,
    StockIssuesController,
  ],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule { }
