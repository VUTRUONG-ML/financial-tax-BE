import { Module } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { VouchersModule } from '../vouchers/vouchers.module';
import { ProductsModule } from '../products/products.module';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService],
  imports: [VouchersModule, ProductsModule, FinancialPeriodsModule],
})
export class InboundInvoicesModule {}
