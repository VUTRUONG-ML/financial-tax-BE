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
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createVoucherDto: CreateVoucherDto,
  ) {
    const data = await this.vouchersService.create(userId, createVoucherDto);
    return { message: 'Voucher created successfully', data };
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    const data = await this.vouchersService.findAll(userId);
    return { message: 'Vouchers retrieved successfully', data };
  }

  @Get(':id')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.vouchersService.findOne(userId, id);
    return { message: 'Voucher details retrieved successfully', data };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVoucherDto: UpdateVoucherDto,
  ) {
    const data = await this.vouchersService.update(
      userId,
      id,
      updateVoucherDto,
    );
    return { message: 'Voucher updated successfully', data };
  }

  @Patch(':voucherCode/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('voucherCode') voucherCode: string,
  ) {
    const data = await this.vouchersService.cancel(userId, voucherCode);
    return { message: 'Voucher canceled successfully', data };
  }
}
