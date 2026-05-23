import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';
import { GetRevenueBookDto } from './dto/get-revenue-book.dto';

@Controller('accounting-books')
@UseGuards(JwtAuthGuard)
export class AccountingBooksController {
  constructor(
    private readonly accountingBooksService: AccountingBooksService,
  ) {}

  @Get('revenue')
  async getRevenueBook(
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

    const data = await this.accountingBooksService.getRevenueBook(
      user.id,
      query.timeFrame,
      customRange,
    );

    return {
      success: true,
      message: 'Retrieve revenue book successfully',
      data,
    };
  }
}
