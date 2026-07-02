import { Injectable, CanActivate, ExecutionContext, BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FinancialPeriodValidationService } from '../../financial-periods/financial-period-validation.service';
import { CHECK_PERIOD_KEY, CheckPeriodResource } from '../decorators/check-period.decorator';
import { RequestWithUser } from '../interface/request-with-user.interface';
import { moment } from '../utils/time.util';
import { AppLogger } from '../logger/app-logger.service';
import { PrismaService } from 'src/core/prisma/prisma.service';

@Injectable()
export class PeriodLockGuard implements CanActivate {
  private log = new AppLogger(PeriodLockGuard.name);
  constructor(
    private reflector: Reflector,
    private validationService: FinancialPeriodValidationService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Kiểm tra xem method có gắn decorator @CheckPeriod không
    const metadata = this.reflector.getAllAndOverride<{
      enabled: boolean;
      resource: CheckPeriodResource;
    }>(CHECK_PERIOD_KEY, [context.getHandler(), context.getClass()]);

    if (!metadata?.enabled) return true;

    // 2. Ép kiểu Request để xử lý Type Safe
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & { financialPeriodId?: number }>();
    const user = request.user;

    const checkDate = await this.resolveCheckDate(
      metadata.resource,
      request,
      user.id,
    );

    this.log.debug('CHECK_PERIOD', {
      resource: metadata.resource,
      checkDate,
    });

    if (!user || !user.id) return false;

    // 3. Gọi Service check
    const period = await this.validationService.getOrCreateAndValidatePeriod(
      user.id,
      checkDate,
    );
    request.financialPeriodId = period.id;
    return true;
  }

  private async resolveCheckDate(
    resource: CheckPeriodResource,
    request: any,
    userId: string,
  ): Promise<Date> {
    switch (resource) {
      case CheckPeriodResource.INVOICE:
        return this.resolveInvoiceDate(request, userId);

      case CheckPeriodResource.BODY:
      default:
        return this.resolveBodyDate(request);
    }
  }

  private resolveBodyDate(request: any): Date {
    const checkDateRaw = (request.body?.issueDate ||
      request.body?.transactionAt ||
      request.body?.receiptDate) as string | undefined;

    if (!checkDateRaw) {
      throw new BadRequestException(
        'Missing transaction date for period check.',
      );
    }
    return checkDateRaw
      ? moment.tz(checkDateRaw, 'Asia/Ho_Chi_Minh').toDate()
      : moment().tz('Asia/Ho_Chi_Minh').toDate();
  }

  private async resolveInvoiceDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const invoicePublicId = request.params?.invoicePublicId as string | undefined;

    if (!invoicePublicId) {
      throw new BadRequestException('Missing invoicePublicId.');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        publicId: invoicePublicId,
        userId,
      },
      select: {
        issueDate: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return invoice.issueDate;
  }
}
