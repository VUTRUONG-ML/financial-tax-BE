import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  imports: [PrismaModule, FinancialPeriodsModule],
  controllers: [VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
