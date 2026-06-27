import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from 'src/common/decorators/check-period.decorator';

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

  @CheckPeriod()
  @Get('opening-summary')
  @HttpCode(HttpStatus.OK)
  async getOpeningSummary(
    @CurrentUser('id') userId: string,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const data = await this.stocksService.getOpeningSummary(
      userId,
      req.financialPeriodId,
    );
    return {
      message: 'Opening stock summary retrieved successfully',
      data,
    };
  }

  @CheckPeriod()
  @Get('opening-list')
  @HttpCode(HttpStatus.OK)
  async getOpeningList(
    @CurrentUser('id') userId: string,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const data = await this.stocksService.getOpeningList(
      userId,
      req.financialPeriodId,
    );
    return {
      message: 'Opening stock list retrieved successfully',
      data,
    };
  }
}
