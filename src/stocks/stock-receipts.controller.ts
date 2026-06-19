import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

@Controller('stock-receipts')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class StockReceiptsController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAllReceipts(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.stocksService.findAllReceipts(
      userId,
      pageNumber,
      limitNumber,
      sourceType,
    );
    return {
      message: 'Stock receipts retrieved successfully',
      ...result,
    };
  }

  @Post()
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createStockReceipt(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateStockReceiptDto,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const result = await this.stocksService.createStockReceipt(
      userId,
      createDto,
      req.financialPeriodId,
    );
    return {
      message: 'Stock receipt created successfully',
      data: result,
    };
  }

  @Patch(':receiptCode/cancel')
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cancelStockReceipt(
    @CurrentUser('id') userId: string,
    @Param('receiptCode') receiptCode: string,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const result = await this.stocksService.cancelReceipt(
      userId,
      req.financialPeriodId,
      receiptCode,
    );
    return {
      message: 'Stock receipt canceled successfully',
      data: result,
    };
  }

  @Post(':receiptCode/link-invoice')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async linkInvoice(
    @CurrentUser('id') userId: string,
    @Param('receiptCode') receiptCode: string,
    @Body('invoicePublicId') invoicePublicId: string,
  ) {
    return await this.stocksService.linkInvoice(
      userId,
      receiptCode,
      invoicePublicId,
    );
  }

  @Delete(':receiptCode/link-invoice/:invoicePublicId')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async unlinkInvoice(
    @CurrentUser('id') userId: string,
    @Param('receiptCode') receiptCode: string,
    @Param('invoicePublicId') invoicePublicId: string,
  ) {
    return await this.stocksService.unlinkInvoice(userId, receiptCode, invoicePublicId);
  }

  @Get(':receiptCode/invoices')
  @HttpCode(HttpStatus.OK)
  async getLinkedInvoices(
    @CurrentUser('id') userId: string,
    @Param('receiptCode') receiptCode: string,
  ) {
    const data = await this.stocksService.getLinkedInvoices(userId, receiptCode);
    return {
      message: 'Linked invoices retrieved successfully',
      data,
    };
  }

  @Get(':receiptCode')
  @HttpCode(HttpStatus.OK)
  async getReceiptDetail(
    @CurrentUser('id') userId: string,
    @Param('receiptCode') receiptCode: string,
  ) {
    const data = await this.stocksService.reconcileReceipt(userId, receiptCode);
    return data;
  }
}
