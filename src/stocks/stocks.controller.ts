import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('stocks')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class StocksController {
  constructor(private readonly stocksService: StocksService) { }

  @Post('receipts')
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

  @Patch('receipts/:receiptCode/cancel')
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
      message: 'Stock receipt created successfully',
      data: result,
    };
  }

  @Post('issues')
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createStockIssue(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateStockIssueDto,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const result = await this.stocksService.createStockIssue(
      userId,
      createDto,
      req.financialPeriodId,
    );
    return {
      message: 'Stock issue created successfully',
      data: result,
    };
  }
}
