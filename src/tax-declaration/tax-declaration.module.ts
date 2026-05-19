import { Module } from '@nestjs/common';
import { TaxDeclarationService } from './tax-declaration.service';
import { TaxDeclarationController } from './tax-declaration.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../core/audit-log/audit-log.module';

@Module({
  imports: [
    PrismaModule,
    FinancialPeriodsModule,
    TaxEngineModule,
    UsersModule,
    AuditLogModule,
  ],
  controllers: [TaxDeclarationController],
  providers: [TaxDeclarationService],
})
export class TaxDeclarationModule {}
