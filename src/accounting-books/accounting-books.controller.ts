import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';
import { GetRevenueBookDto } from './dto/get-revenue-book.dto';
import { GetCashFlowBookDto } from './dto/get-cash-flow-book.dto';
import { GetExpenseBookDto } from './dto/get-expense-book.dto';
import { GetInventoryBookDto } from './dto/get-inventory-book.dto';

@Controller('accounting-books')
@UseGuards(JwtAuthGuard)
export class AccountingBooksController {
  constructor(
    private readonly accountingBooksService: AccountingBooksService,
  ) { }

  @Get('revenue/summary')
  async getRevenueBookSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: GetRevenueBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getRevenueBookSummary(
      user.id,
      query.timeFrame,
      customRange,
    );

    return {
      success: true,
      message: 'Retrieve revenue book summary successfully',
      data,
    };
  }

  @Get('revenue/records')
  async getRevenueBookRecords(
    @CurrentUser() user: RequestUser,
    @Query() query: GetRevenueBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getRevenueBookRecords(
      user.id,
      query.timeFrame,
      customRange,
      query.page,
      query.limit,
      query.syncCode,
    );

    return {
      success: true,
      message: 'Retrieve revenue book successfully',
      data,
    };
  }

  @Get('cash-flow/summary')
  async getCashFlowBookSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: GetCashFlowBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getCashFlowBookSummary(
      user.id,
      query.timeFrame,
      customRange,
    );

    return {
      success: true,
      message: 'Retrieve cash flow book summary successfully',
      data,
    };
  }

  @Get('cash-flow/records')
  async getCashFlowBookRecords(
    @CurrentUser() user: RequestUser,
    @Query() query: GetCashFlowBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getCashFlowBookRecords(
      user.id,
      query.timeFrame,
      customRange,
      query.bookKey,
      query.page,
      query.limit,
      query.syncCode,
    );

    return {
      success: true,
      message: 'Retrieve cash flow book successfully',
      data,
    };
  }

  @Get('expense/summary')
  async getExpenseBookSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: GetExpenseBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getExpenseBookSummary(
      user.id,
      query.timeFrame,
      customRange,
    );

    return {
      success: true,
      message: 'Retrieve expense book summary successfully',
      data,
    };
  }

  @Get('expense/records')
  async getExpenseBookRecords(
    @CurrentUser() user: RequestUser,
    @Query() query: GetExpenseBookDto,
  ) {
    const customRange =
      query.year || query.quarter
        ? {
          year: query.year,
          quarter: query.quarter,
        }
        : undefined;

    const data = await this.accountingBooksService.getExpenseBookRecords(
      user.id,
      query.timeFrame,
      customRange,
      query.page,
      query.limit,
      query.syncCode,
    );

    return {
      success: true,
      message: 'Retrieve expense book successfully',
      data,
    };
  }

  @Post('inventory/summary')
  async getInventoryBookSummary(
    @CurrentUser() user: RequestUser,
    @Body() dto: GetInventoryBookDto,
  ) {
    const data = await this.accountingBooksService.getInventoryBookSummary(
      user.id,
      dto.periodPublicId,
      dto.productPublicId,
    );

    return {
      success: true,
      message: 'Retrieve inventory book summary successfully',
      data,
    };
  }

  @Get('inventory/records')
  async getInventoryBookRecords(
    @CurrentUser() user: RequestUser,
    @Query() query: GetInventoryBookDto,
  ) {
    const data = await this.accountingBooksService.getInventoryBookRecords(
      user.id,
      query.timeFrame,
      query.productPublicId,
    );

    return {
      success: true,
      message: 'Retrieve inventory book successfully',
      data,
    };
  }
}
