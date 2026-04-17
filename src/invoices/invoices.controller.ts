import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // POST /invoices — Tạo hóa đơn mới (status: DRAFT)
  @Post()
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
}
