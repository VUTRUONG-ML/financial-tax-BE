import { Module } from '@nestjs/common';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';

import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [StocksModule],
  controllers: [InternalProductionOrdersController],
  providers: [InternalProductionOrdersService],
})
export class InternalProductionOrdersModule {}
