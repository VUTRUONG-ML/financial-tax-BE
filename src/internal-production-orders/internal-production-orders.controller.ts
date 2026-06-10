import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { GetProductionOrdersQueryDto } from './dto/get-production-orders-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('internal-production-orders')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class InternalProductionOrdersController {
  constructor(
    private readonly internalProductionOrdersService: InternalProductionOrdersService,
  ) {}

  @Post()
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateProductionOrderDto,
  ) {
    const result = await this.internalProductionOrdersService.create(
      userId,
      createDto,
    );
    return {
      message: 'Internal production order created successfully',
      data: result,
    };
  }

  @Patch(':orderCode/cancel')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('orderCode') orderCode: string,
  ) {
    const result = await this.internalProductionOrdersService.cancel(
      userId,
      orderCode,
    );
    return {
      message: 'Production order canceled.',
      data: result,
    };
  }

  @Get('summary')
  async getSummary(@CurrentUser('id') userId: string) {
    const result =
      await this.internalProductionOrdersService.getSummary(userId);
    return {
      message: 'Production orders summary retrieved successfully',
      data: result,
    };
  }

  @Get(':orderCode')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('orderCode') orderCode: string,
  ) {
    const result = await this.internalProductionOrdersService.findOne(
      userId,
      orderCode,
    );
    return {
      message: 'Internal production order details retrieved successfully',
      data: result,
    };
  }

  @Patch(':orderCode')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('orderCode') orderCode: string,
    @Body() updateDto: UpdateProductionOrderDto,
  ) {
    const result = await this.internalProductionOrdersService.update(
      userId,
      orderCode,
      updateDto,
    );
    return {
      message: 'Internal production order updated successfully',
      data: result,
    };
  }

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: GetProductionOrdersQueryDto,
  ) {
    const result = await this.internalProductionOrdersService.findAll(
      userId,
      query,
    );
    return {
      message: 'Internal production orders retrieved successfully',
      ...result,
    };
  }
}
