import { PartialType } from '@nestjs/swagger';
import { CreateInboundInvoiceDto } from './create-inbound-invoice.dto';

export class UpdateInboundInvoiceDto extends PartialType(CreateInboundInvoiceDto) {}
