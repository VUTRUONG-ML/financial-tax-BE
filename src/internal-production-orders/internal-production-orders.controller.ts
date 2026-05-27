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

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.internalProductionOrdersService.findAll(
      userId,
      pageNumber,
      limitNumber,
    );
    return {
      message: 'Internal production orders retrieved successfully',
      ...result,
    };
  }
}
