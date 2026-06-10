import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FinancialPeriodValidationService } from '../../financial-periods/financial-period-validation.service';
import { CHECK_PERIOD_KEY } from '../decorators/check-period.decorator';
import { RequestWithUser } from '../interface/request-with-user.interface';
import { moment } from '../utils/time.util';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class PeriodLockGuard implements CanActivate {
  private log = new AppLogger(PeriodLockGuard.name);
  constructor(
    private reflector: Reflector,
    private validationService: FinancialPeriodValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Kiểm tra xem method có gắn decorator @CheckPeriod không
    const isCheckRequired = this.reflector.getAllAndOverride<boolean>(
      CHECK_PERIOD_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isCheckRequired) return true;

    // 2. Ép kiểu Request để xử lý Type Safe
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & { financialPeriodId?: number }>();
    const user = request.user;

    if (!user || !user.id) return false;

    const checkDateRaw = (request.body?.issueDate ||
      request.body?.transactionAt ||
      request.body?.receiptDate) as string | undefined;
    const checkDate = checkDateRaw
      ? moment(checkDateRaw).toDate()
      : moment().toDate();
    this.log.debug('CHECK_PERIOD', { checkDate });
    // 3. Gọi Service check
    const period = await this.validationService.getOrCreateAndValidatePeriod(
      user.id,
      checkDate,
    );
    request.financialPeriodId = period.id;
    return true;
  }
}
