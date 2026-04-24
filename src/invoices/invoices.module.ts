import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TaxAuthorityModule } from 'src/tax-authority/tax-authority.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  imports: [TaxAuthorityModule, VouchersModule],
})
export class InvoicesModule {}
