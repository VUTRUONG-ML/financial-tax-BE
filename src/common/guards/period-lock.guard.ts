import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
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

    if (!user || !user.id) {
      this.log.warn('CHECK_PERIOD_FAILED', {
        resource: metadata.resource,
        reason: 'USER_NOT_FOUND',
        method: request.method,
        path: request.path,
      });
      return false;
    }

    try {
      const checkDate = await this.resolveCheckDate(
        metadata.resource,
        request,
        user.id,
      );

      this.log.debug('CHECK_PERIOD', {
        resource: metadata.resource,
        checkDate,
      });

      // 3. Gá»i Service check
      const period = await this.validationService.getOrCreateAndValidatePeriod(
        user.id,
        checkDate,
      );
      request.financialPeriodId = period.id;
      return true;
    } catch (error) {
      this.logPeriodCheckError(error, metadata.resource, request, user.id);
      throw error;
    }
  }

  private logPeriodCheckError(
    error: unknown,
    resource: CheckPeriodResource,
    request: any,
    userId: string,
  ): void {
    const errorResponse =
      error instanceof HttpException ? error.getResponse() : undefined;
    const reason =
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'message' in errorResponse
        ? (errorResponse as { message: unknown }).message
        : error instanceof Error
          ? error.message
          : 'UNKNOWN_ERROR';

    this.log.warn('CHECK_PERIOD_FAILED', {
      resource,
      reason,
      userId,
      method: request.method,
      path: request.path,
      statusCode:
        error instanceof HttpException ? error.getStatus() : undefined,
    });
    this.log.debug('CHECK_PERIOD_FAILED_DETAIL', {
      resource,
      userId,
      params: request.params,
      dateFields: {
        issueDate: request.body?.issueDate,
        transactionAt: request.body?.transactionAt,
        receiptDate: request.body?.receiptDate,
      },
      errorName: error instanceof Error ? error.name : undefined,
    });
  }

  private async resolveCheckDate(
    resource: CheckPeriodResource,
    request: any,
    userId: string,
  ): Promise<Date> {
    switch (resource) {
      case CheckPeriodResource.INVOICE:
        return this.resolveInvoiceDate(request, userId);

      case CheckPeriodResource.STOCK_RECEIPT:
        return this.resolveStockReceiptDate(request, userId);

      case CheckPeriodResource.STOCK_ISSUE:
        return this.resolveStockIssueDate(request, userId);

      case CheckPeriodResource.VOUCHER:
        return this.resolveVoucherDate(request, userId);

      case CheckPeriodResource.PRODUCTION_ORDER:
        return this.resolveProductionOrderDate(request, userId);

      case CheckPeriodResource.BODY:
      default:
        return this.resolveBodyDate(request);
    }
  }

  private getBodyDate(request: any): Date | null {
    const checkDateRaw = (request.body?.issueDate ||
      request.body?.transactionAt ||
      request.body?.receiptDate) as string | undefined;

    return checkDateRaw
      ? moment.tz(checkDateRaw, 'Asia/Ho_Chi_Minh').toDate()
      : null;
  }

  private resolveBodyDate(request: any): Date {
    const bodyDate = this.getBodyDate(request);

    if (!bodyDate) {
      throw new BadRequestException(
        'Missing transaction date for period check.',
      );
    }
    return bodyDate;
  }

  private async resolveInvoiceDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const bodyDate = this.getBodyDate(request);
    if (bodyDate) return bodyDate;

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

  private async resolveStockReceiptDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const bodyDate = this.getBodyDate(request);
    if (bodyDate) return bodyDate;

    const receiptCode = request.params?.receiptCode as string | undefined;
    if (!receiptCode) {
      throw new BadRequestException('Missing receiptCode.');
    }

    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { receiptCode, userId },
      select: { receiptDate: true },
    });

    if (!receipt) {
      throw new NotFoundException('Stock receipt not found.');
    }

    return receipt.receiptDate;
  }

  private async resolveStockIssueDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const bodyDate = this.getBodyDate(request);
    if (bodyDate) return bodyDate;

    const issueCode = request.params?.issueCode as string | undefined;
    if (!issueCode) {
      throw new BadRequestException('Missing issueCode.');
    }

    const issue = await this.prisma.stockIssue.findFirst({
      where: { issueCode, userId },
      select: { issueDate: true },
    });

    if (!issue) {
      throw new NotFoundException('Stock issue not found.');
    }

    return issue.issueDate;
  }

  private async resolveVoucherDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const bodyDate = this.getBodyDate(request);
    if (bodyDate) return bodyDate;

    const voucherCode = request.params?.voucherCode as string | undefined;
    if (!voucherCode) {
      throw new BadRequestException('Missing voucherCode.');
    }

    const voucher = await this.prisma.voucher.findFirst({
      where: { voucherCode, userId },
      select: { transactionAt: true },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found.');
    }

    return voucher.transactionAt;
  }

  private async resolveProductionOrderDate(
    request: any,
    userId: string,
  ): Promise<Date> {
    const bodyDate = this.getBodyDate(request);
    if (bodyDate) return bodyDate;

    const orderCode = request.params?.orderCode as string | undefined;
    if (!orderCode) {
      throw new BadRequestException('Missing orderCode.');
    }

    const order = await this.prisma.internalProductionOrder.findFirst({
      where: { orderCode, userId },
      select: { transactionAt: true },
    });

    if (!order) {
      throw new NotFoundException('Production order not found.');
    }

    return order.transactionAt;
  }
}
