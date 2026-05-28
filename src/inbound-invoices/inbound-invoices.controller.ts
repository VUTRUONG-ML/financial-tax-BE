import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import { Throttle } from '@nestjs/throttler';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateInboundInvoiceDto } from './dto/update-inbound-invoice.dto';

@Controller('inbound-invoices')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class InboundInvoicesController {
  constructor(
    private readonly inboundInvoicesService: InboundInvoicesService,
  ) { }

  @Get()
  async findAllInboundInvoice(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.inboundInvoicesService.findAllInboundInvoices(
      userId,
      pageNumber,
      limitNumber,
      type,
    );
    return {
      message: 'Get all inbound invoice success.',
      ...result,
    };
  }

  @Get('summary')
  async getSummary(@CurrentUser('id') userId: string) {
    const data = await this.inboundInvoicesService.getSummary(userId);
    return {
      message: 'Get inbound invoice summary success.',
      data,
    };
  }

  @Get('/:publicId')
  async findOne(
    @Param('publicId') publicId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.inboundInvoicesService.detailInboundInvoice(
      publicId,
      userId,
    );
    return {
      message: 'Get detail inbound invoice success.',
      data: result,
    };
  }

  @Post()
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async createInboundInvoice(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInboundInvoiceDto,
  ) {
    const result = await this.inboundInvoicesService.create(userId, dto);
    return {
      message: 'Create success.',
      data: result,
    };
  }

  @Patch('/:publicId/cancel')
  @CheckPeriod()
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async cancelInboundInvoice(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const result = await this.inboundInvoicesService.cancel(userId, publicId);
    return {
      message: 'Cancel inbound invoice success.',
      data: result,
    };
  }

  @Patch('/:publicId/sync-inventory')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async syncInventory(
    @Param('publicId') publicId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.inboundInvoicesService.syncToInventory(
      userId,
      publicId,
    );
    return {
      message: 'Sync to inventory success.',
      data: result,
    };
  }

  @Patch('/:publicId')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async update(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
    @Body() dto: UpdateInboundInvoiceDto,
  ) {
    const data = await this.inboundInvoicesService.update(userId, publicId, dto);
    return {
      message: 'Update success.',
      data,
    };
  }

  @Delete('/:publicId')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const result = await this.inboundInvoicesService.remove(userId, publicId);
    return result;
  }
}
