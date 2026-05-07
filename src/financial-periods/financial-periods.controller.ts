import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FinancialPeriodsService } from './financial-periods.service';
import { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';
import { UpdateFinancialPeriodDto } from './dto/update-financial-period.dto';
import { FinancialPeriodResponseDto } from './dto/financial-period-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';

@ApiTags('Financial Periods')
@ApiBearerAuth()
@Controller('financial-periods')
export class FinancialPeriodsController {
  constructor(
    private readonly financialPeriodsService: FinancialPeriodsService,
  ) {}

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
