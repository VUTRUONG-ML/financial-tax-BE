import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule, TaxEngineModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
