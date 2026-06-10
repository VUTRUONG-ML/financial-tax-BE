import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('stocks')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

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
}
