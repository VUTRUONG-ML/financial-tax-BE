import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
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

@ApiTags('Financial Periods')
@ApiBearerAuth()
@Controller('financial-periods')
export class FinancialPeriodsController {
  constructor(
    private readonly financialPeriodsService: FinancialPeriodsService,
  ) { }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getSummary(@CurrentUser() user: RequestUser) {
    const res = await this.financialPeriodsService.summary(user.id);
    return {
      message: 'Get summary successful',
      data: res,
    };
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy chi tiết một kỳ tài chính bằng publicId' })
  @ApiResponse({ status: 200, type: FinancialPeriodResponseDto })
  async getDetail(
    @CurrentUser() user: RequestUser,
    @Param('id') publicId: string,
  ): Promise<{ message: string; data: FinancialPeriodResponseDto }> {
    const data = await this.financialPeriodsService.findOne(user.id, publicId);
    return { message: 'Lấy chi tiết kỳ tài chính thành công', data };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ){
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const res = await this.financialPeriodsService.findAll(
      user.id,
      pageNumber,
      limitNumber,
      status,
    );
    return {
      message: 'Get all period successful',
      ...res,
    };
  }
}
