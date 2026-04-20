import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TaxAuthorityModule } from 'src/tax-authority/tax-authority.module';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  imports: [TaxAuthorityModule],
})
export class InvoicesModule {}
