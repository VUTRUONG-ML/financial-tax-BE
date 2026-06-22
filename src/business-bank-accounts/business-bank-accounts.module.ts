import { Module } from '@nestjs/common';
import { BusinessBankAccountsService } from './business-bank-accounts.service';
import { BusinessBankAccountsController } from './business-bank-accounts.controller';

@Module({
  controllers: [BusinessBankAccountsController],
  providers: [BusinessBankAccountsService],
  exports: [BusinessBankAccountsService],
})
export class BusinessBankAccountsModule {}
