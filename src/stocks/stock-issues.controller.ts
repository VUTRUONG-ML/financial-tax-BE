import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

@Controller('stock-issues')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class StockIssuesController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAllIssues(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.stocksService.findAllIssues(
      userId,
      pageNumber,
      limitNumber,
      sourceType,
    );
    return {
      message: 'Stock issues retrieved successfully',
      ...result,
    };
  }

  @Post()
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

  @Patch(':issueCode/cancel')
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cancelStockIssue(
    @CurrentUser('id') userId: string,
    @Param('issueCode') issueCode: string,
    @Req() req: Request & { financialPeriodId: number },
  ) {
    const result = await this.stocksService.cancelIssue(
      userId,
      req.financialPeriodId,
      issueCode,
    );
    return {
      message: 'Stock issue canceled successfully',
      data: result,
    };
  }
}
