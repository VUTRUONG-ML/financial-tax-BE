import { Module } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { VouchersModule } from '../vouchers/vouchers.module';
import { ProductsModule } from '../products/products.module';

@Module({
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService],
  imports: [VouchersModule, ProductsModule],
})
export class InboundInvoicesModule {}
