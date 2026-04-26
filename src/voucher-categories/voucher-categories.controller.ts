import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { VoucherCategoriesService } from './voucher-categories.service';
import { CreateVoucherCategoryDto } from './dto/create-voucher-category.dto';
import { UpdateVoucherCategoryDto } from './dto/update-voucher-category.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('voucher-categories')
export class VoucherCategoriesController {
  constructor(
    private readonly voucherCategoriesService: VoucherCategoriesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createVoucherCategoryDto: CreateVoucherCategoryDto,
  ) {
    const defaultRes = { message: 'Voucher category created successfully' };
    const data = await this.voucherCategoriesService.create(
      userId,
      createVoucherCategoryDto,
    );
    return { ...defaultRes, data };
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    const data = await this.voucherCategoriesService.findAll(userId);
    return { message: 'Voucher categories retrieved successfully', data };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVoucherCategoryDto: UpdateVoucherCategoryDto,
  ) {
    const data = await this.voucherCategoriesService.update(
      userId,
      id,
      updateVoucherCategoryDto,
    );
    return { message: 'Voucher category updated successfully', data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.voucherCategoriesService.remove(userId, id);
    return { message: 'Voucher category deleted successfully' };
  }
}
