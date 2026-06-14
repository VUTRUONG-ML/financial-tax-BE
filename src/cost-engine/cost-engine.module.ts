import { Module, forwardRef } from '@nestjs/common';
import { CostEngineService } from './cost-engine.service';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  imports: [forwardRef(() => FinancialPeriodsModule)],
  providers: [CostEngineService],
  exports: [CostEngineService],
})
export class CostEngineModule {}
