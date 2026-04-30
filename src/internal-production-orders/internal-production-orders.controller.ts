import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('internal-production-orders')
export class InternalProductionOrdersController {
  constructor(
    private readonly internalProductionOrdersService: InternalProductionOrdersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
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

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    const result = await this.internalProductionOrdersService.findAll(userId);
    return {
      message: 'Internal production orders retrieved successfully',
      ...result,
    };
  }
}
