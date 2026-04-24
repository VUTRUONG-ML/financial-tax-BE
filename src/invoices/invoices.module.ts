import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TaxAuthorityModule } from 'src/tax-authority/tax-authority.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { ProductsModule } from '../products/products.module';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  imports: [TaxAuthorityModule, VouchersModule, ProductsModule],
})
export class InvoicesModule {}
