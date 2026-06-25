import { Module, forwardRef, Global } from '@nestjs/common';
import { FinancialPeriodsService } from './financial-periods.service';
import { FinancialPeriodsController } from './financial-periods.controller';
import { FinancialPeriodValidationService } from './financial-period-validation.service';
import { PrismaModule } from '../core/prisma/prisma.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { CostEngineModule } from '../cost-engine/cost-engine.module';
import { StocksModule } from '../stocks/stocks.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    TaxEngineModule,
    forwardRef(() => CostEngineModule),
    StocksModule,
    VouchersModule,
  ],
  controllers: [FinancialPeriodsController],
  providers: [FinancialPeriodsService, FinancialPeriodValidationService],
  exports: [FinancialPeriodValidationService, FinancialPeriodsService], // Export the middleware service so other modules can use it
})
export class FinancialPeriodsModule {}
