import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // POST /invoices — Tạo hóa đơn mới (status: DRAFT)
  @Post()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    const data = await this.invoicesService.createInvoice(userId, dto);
    return {
      message: 'Invoice created successfully.',
      data,
    };
  }

  @Post(':id/publish')
  async publish(
    @Param('id') invoiceId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.invoicesService.publishInvoice(invoiceId, userId);
    return {
      message:
        'Complete the process of calling the tax authority for the code.',
      data: result,
    };
  }

  @Get()
  async getAllInvoice(@CurrentUser('id') userId: string) {
    const result = await this.invoicesService.findAll(userId);
    return {
      message: 'Get all invoice own success',
      data: result,
    };
  }

  @Get('/:invoicePublicId/details')
  async getDetailInvoice(
    @CurrentUser('id') userId: string,
    @Param('invoicePublicId') invPublicId: string,
  ) {
    const result = await this.invoicesService.detailInvoice(
      userId,
      invPublicId,
    );
    return {
      message: 'Get detail success.',
      data: result,
    };
  }

  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  @Patch('/:invoicePublicId/cancel')
  async cancelInvoice(
    @Param('invoicePublicId') invPublicId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.invoicesService.canceledInvoice(
      invPublicId,
      userId,
    );
    return {
      message: 'Invoice canceled success.',
      data: result,
    };
  }
}
