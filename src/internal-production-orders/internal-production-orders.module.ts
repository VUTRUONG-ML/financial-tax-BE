import { Module } from '@nestjs/common';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';

import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  imports: [FinancialPeriodsModule],
  controllers: [InternalProductionOrdersController],
  providers: [InternalProductionOrdersService]
})
export class InternalProductionOrdersModule {}
