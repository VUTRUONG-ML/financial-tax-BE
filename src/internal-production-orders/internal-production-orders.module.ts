import { Module } from '@nestjs/common';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';

@Module({
  controllers: [InternalProductionOrdersController],
  providers: [InternalProductionOrdersService]
})
export class InternalProductionOrdersModule {}
