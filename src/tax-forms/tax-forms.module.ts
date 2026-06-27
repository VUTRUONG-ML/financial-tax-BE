import { Module } from '@nestjs/common';
import { TaxFormsService } from './tax-forms.service';
import { TaxFormsController } from './tax-forms.controller';
import { UsersModule } from '../users/users.module';
import { BusinessBankAccountsModule } from '../business-bank-accounts/business-bank-accounts.module';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [UsersModule, BusinessBankAccountsModule, PrismaModule],
  controllers: [TaxFormsController],
  providers: [TaxFormsService],
  exports: [TaxFormsService],
})
export class TaxFormsModule {}
