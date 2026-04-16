import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
}
