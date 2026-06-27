import { Module } from '@nestjs/common';
import { TaxDeclarationService } from './tax-declaration.service';
import { TaxDeclarationController } from './tax-declaration.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../core/audit-log/audit-log.module';
import { StocksModule } from '../stocks/stocks.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { TaxFormsModule } from '../tax-forms/tax-forms.module';

@Module({
  imports: [
    PrismaModule,
    TaxEngineModule,
    UsersModule,
    AuditLogModule,
    StocksModule,
    VouchersModule,
    TaxFormsModule,
  ],
  controllers: [TaxDeclarationController],
  providers: [TaxDeclarationService],
})
export class TaxDeclarationModule {}
