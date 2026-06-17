import { Module } from '@nestjs/common';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';

import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [FinancialPeriodsModule, StocksModule],
  controllers: [InternalProductionOrdersController],
  providers: [InternalProductionOrdersService],
})
export class InternalProductionOrdersModule {}
