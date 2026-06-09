import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Query,
  UseGuards,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('vouchers')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) { }

  @Post()
  @CheckPeriod()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createVoucherDto: CreateVoucherDto,
  ) {
    const data = await this.vouchersService.create(userId, createVoucherDto);
    return { message: 'Voucher created successfully', data };
  }

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.vouchersService.findAll(
      userId,
      pageNumber,
      limitNumber,
      fromDate,
    );
    return { message: 'Vouchers retrieved successfully', ...result };
  }

  @Get('summary')
  async getSummary(
    @CurrentUser('id') userId: string,
    @Query('fromDate') fromDate?: string,
  ) {
    if (!fromDate) {
      throw new BadRequestException('fromDate query parameter is required');
    }
    const data = await this.vouchersService.getSummary(userId, fromDate);
    return { message: 'Voucher summary retrieved successfully', data };
  }

  @Get(':voucherCode')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('voucherCode') voucherCode: string,
  ) {
    const data = await this.vouchersService.findOne(userId, voucherCode);
    return { message: 'Voucher details retrieved successfully', data };
  }

  @Patch(':voucherCode')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('voucherCode') voucherCode: string,
    @Body() updateVoucherDto: UpdateVoucherDto,
  ) {
    const data = await this.vouchersService.update(
      userId,
      voucherCode,
      updateVoucherDto,
    );
    return { message: 'Voucher updated successfully', data };
  }

  @Patch(':voucherCode/cancel')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('voucherCode') voucherCode: string,
  ) {
    const data = await this.vouchersService.cancel(userId, voucherCode);
    return { message: 'Voucher canceled successfully', data };
  }

  @Delete(':voucherCode')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('voucherCode') voucherCode: string,
  ) {
    const data = await this.vouchersService.remove(userId, voucherCode);
    return data;
  }
}
