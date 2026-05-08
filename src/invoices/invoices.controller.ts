import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';

@UseGuards(JwtAuthGuard, PeriodLockGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // POST /invoices — Tạo hóa đơn mới (status: DRAFT)
  @Post()
  @CheckPeriod()
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
  @CheckPeriod()
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
      ...result,
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
  @CheckPeriod()
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

  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @CheckPeriod()
  @Patch('/:invoicePublicId')
  async updateInvoice(
    @Param('invoicePublicId') invPublicId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    const data = await this.invoicesService.updateInvoice(
      invPublicId,
      userId,
      dto,
    );
    return {
      message: 'Invoice updated successfully.',
      data,
    };
  }
}
