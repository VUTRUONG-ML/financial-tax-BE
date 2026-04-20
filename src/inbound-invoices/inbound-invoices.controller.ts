import { Controller, Get, Param, Post } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';

@Controller('inbound-invoices')
export class InboundInvoicesController {
  constructor(
    private readonly inboundInvoicesService: InboundInvoicesService,
  ) {}

  @Get()
  async findAllInboundInvoice(@CurrentUser('id') userId: string) {
    const result =
      await this.inboundInvoicesService.findAllInboundInvoices(userId);
    return {
      message: 'Get all inbound invoice success.',
      data: result,
    };
  }

  @Get('/:publicId')
  async findOne(
    @Param('publicId') publicId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.inboundInvoicesService.detailInboundInvoice(
      publicId,
      userId,
    );
    return {
      message: 'Get detail inbound invoice success.',
      data: result,
    };
  }

  @Post()
  async createInboundInvoice(
    @CurrentUser('id') userId: string,
    dto: CreateInboundInvoiceDto,
  ) {
    const result = await this.inboundInvoicesService.create(userId, dto);
    return {
      message: 'Create success.',
      data: result,
    };
  }
}
