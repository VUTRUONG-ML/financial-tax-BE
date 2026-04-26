import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import { Throttle } from '@nestjs/throttler';

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
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async createInboundInvoice(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInboundInvoiceDto,
  ) {
    const result = await this.inboundInvoicesService.create(userId, dto);
    return {
      message: 'Create success.',
      data: result,
    };
  }

  @Patch('/:publicId/cancel')
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async cancelInboundInvoice(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const result = await this.inboundInvoicesService.cancel(userId, publicId);
    return {
      message: 'Cancel inbound invoice success.',
      data: result,
    };
  }

  @Patch('/:publicId/sync-inventory')
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async syncInventory(
    @Param('publicId') publicId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.inboundInvoicesService.syncToInventory(
      userId,
      publicId,
    );
    return {
      message: 'Sync to inventory success.',
      data: result,
    };
  }
}
