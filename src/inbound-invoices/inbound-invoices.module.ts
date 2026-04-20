import { Module } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InboundInvoicesController } from './inbound-invoices.controller';

@Module({
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService],
})
export class InboundInvoicesModule {}
