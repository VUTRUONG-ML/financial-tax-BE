import { Module } from '@nestjs/common';
import { TaxFormsService } from './tax-forms.service';
import { TaxFormsController } from './tax-forms.controller';
import { UsersModule } from '../users/users.module';
import { BusinessBankAccountsModule } from '../business-bank-accounts/business-bank-accounts.module';

@Module({
  imports: [UsersModule, BusinessBankAccountsModule],
  controllers: [TaxFormsController],
  providers: [TaxFormsService],
})
export class TaxFormsModule {}
