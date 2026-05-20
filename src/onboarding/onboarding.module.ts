import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService],
  imports: [FinancialPeriodsModule],
})
export class OnboardingModule {}
