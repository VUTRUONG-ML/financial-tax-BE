import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TaxAuthorityModule } from 'src/tax-authority/tax-authority.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { ProductsModule } from '../products/products.module';
import { StocksModule } from '../stocks/stocks.module';
import { TaxAuthorityConnectionsModule } from 'src/tax-authority-connections/tax-authority-connections.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  imports: [
    TaxAuthorityModule,
    TaxAuthorityConnectionsModule,
    VouchersModule,
    ProductsModule,
    StocksModule,
    OnboardingModule,
  ],
})
export class InvoicesModule { }
