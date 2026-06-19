import { Module } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { InvoiceSyncService } from './invoice-sync.service';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService, InvoiceSyncService],
  imports: [VouchersModule],
})
export class InboundInvoicesModule {}
