import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InvoiceSyncService } from './invoice-sync.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('inbound-invoices')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class InboundInvoicesController {
  constructor(
    private readonly inboundInvoicesService: InboundInvoicesService,
    private readonly invoiceSyncService: InvoiceSyncService,
  ) {}

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

  @Post('trigger-sync')
  @CheckPeriod()
  async triggerSync(@CurrentUser('id') userId: string) {
    const syncedCount = await this.invoiceSyncService.syncForUser(userId);
    return {
      message: 'Tax Authority invoice synchronization completed.',
      data: {
        syncedCount,
      },
    };
  }
}
