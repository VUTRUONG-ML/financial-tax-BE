import { Module, forwardRef } from '@nestjs/common';
import { CostEngineService } from './cost-engine.service';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [forwardRef(() => FinancialPeriodsModule), StocksModule],
  providers: [CostEngineService],
  exports: [CostEngineService],
})
export class CostEngineModule {}
