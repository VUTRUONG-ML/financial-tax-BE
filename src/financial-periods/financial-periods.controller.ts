import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FinancialPeriodsService } from './financial-periods.service';
import { UpdateFinancialPeriodDto } from './dto/update-financial-period.dto';
import { FinancialPeriodResponseDto } from './dto/financial-period-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';
import { ConfirmTaxPaymentDto } from './dto/confirm-financial-period.dto';
import { CloseFinancialPeriodDto } from './dto/close-financial-period.dto';

@ApiTags('Financial Periods')
@ApiBearerAuth()
@Controller('financial-periods')
export class FinancialPeriodsController {
  constructor(
    private readonly financialPeriodsService: FinancialPeriodsService,
  ) { }

  // @Post()
  // @ApiOperation({ summary: 'Tạo mới một kỳ tài chính' })
  // @ApiResponse({ status: 201, type: FinancialPeriodResponseDto })
  // async create(
  //   @CurrentUser() user: RequestUser,
  //   @Body() createDto: CreateFinancialPeriodDto,
  // ): Promise<{ message: string; data: FinancialPeriodResponseDto }> {
  //   const data = await this.financialPeriodsService.create(user, createDto);
  //   return { message: 'Tạo kỳ tài chính thành công', data };
  // }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Chốt sổ của kì (chỉ Admin)' })
  @HttpCode(HttpStatus.OK)
  async closePeriod(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
    @Body() dto: CloseFinancialPeriodDto,
  ) {
    const { period } = await this.financialPeriodsService.closeFinancialPeriod(
      user.id,
      publicId,
      dto,
    );
    return { message: 'Close financial period success.', data: period };
  }

  @Patch(':id/reopen')
  @HttpCode(HttpStatus.OK)
  async reopenPeriod(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
  ) {
    const data = await this.financialPeriodsService.openFinancialPeriod(
      user.id,
      publicId,
    );
    return { message: 'Reopen financial period success.', data };
  }

  @Patch(':id/confirm-payment')
  @ApiOperation({ summary: 'Xác nhận nộp tiền (chỉ Admin)' })
  async confirmTaxPayment(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
    @Body() dto: ConfirmTaxPaymentDto,
  ) {
    const data = await this.financialPeriodsService.finishedTaxPayment(
      user.id,
      publicId,
      dto,
    );
    return { message: 'Confirm tax payment success.', data };
  }

  @Get(':id/compare-pit')
  @ApiOperation({ summary: 'So sánh mức thuế PIT ở mức doanh thu thứ 2' })
  async comparePit(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
  ) {
    const data = await this.financialPeriodsService.comparePit(
      user.id,
      publicId,
    );
    return { message: 'Compare PIT success.', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật kỳ tài chính (chỉ Admin)' })
  @ApiResponse({ status: 200, type: FinancialPeriodResponseDto })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
    @Body() updateDto: UpdateFinancialPeriodDto,
  ): Promise<{ message: string; data: FinancialPeriodResponseDto }> {
    const data = await this.financialPeriodsService.update(
      user,
      publicId,
      updateDto,
    );
    return { message: 'Cập nhật kỳ tài chính thành công', data };
  }
}
