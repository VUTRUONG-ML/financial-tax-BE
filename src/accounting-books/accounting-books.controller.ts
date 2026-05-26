import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';
import { GetRevenueBookDto } from './dto/get-revenue-book.dto';
import { GetCashFlowBookDto } from './dto/get-cash-flow-book.dto';

@Controller('accounting-books')
@UseGuards(JwtAuthGuard)
export class AccountingBooksController {
  constructor(
    private readonly accountingBooksService: AccountingBooksService,
  ) {}

  @Get('revenue/summary')
  async getRevenueBookSummary(
    @CurrentUser() user: RequestUser,
    @Query() query: GetRevenueBookDto,
  ) {
    const customRange =
      query.startDate && query.endDate
        ? {
            startDate: new Date(query.startDate),
            endDate: new Date(query.endDate),
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
      query.startDate && query.endDate
        ? {
            startDate: new Date(query.startDate),
            endDate: new Date(query.endDate),
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
    const data = await this.accountingBooksService.getCashFlowBookSummary(
      user.id,
      query.timeFrame,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
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
    const data = await this.accountingBooksService.getCashFlowBookRecords(
      user.id,
      query.timeFrame,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
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
}
