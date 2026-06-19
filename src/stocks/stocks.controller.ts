import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

@Controller('stocks')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getSummary(@CurrentUser('id') userId: string) {
    const data = await this.stocksService.getSummary(userId);
    return {
      message: 'Stock summary retrieved successfully',
      data,
    };
  }
}
