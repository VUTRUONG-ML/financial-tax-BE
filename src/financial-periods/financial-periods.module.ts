import { Module } from '@nestjs/common';
import { FinancialPeriodsService } from './financial-periods.service';
import { FinancialPeriodsController } from './financial-periods.controller';
import { FinancialPeriodValidationService } from './financial-period-validation.service';
import { PrismaModule } from '../core/prisma/prisma.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';

@Module({
  imports: [PrismaModule, TaxEngineModule],
  controllers: [FinancialPeriodsController],
  providers: [FinancialPeriodsService, FinancialPeriodValidationService],
  exports: [FinancialPeriodValidationService], // Export the middleware service so other modules can use it
})
export class FinancialPeriodsModule {}
