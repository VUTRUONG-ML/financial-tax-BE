import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { moment } from '../common/utils/time.util';
import { PeriodStatus } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_ACTIONS } from '../common/constants/log-events.constant';

@Injectable()
export class FinancialPeriodValidationService {
  private readonly log = new AppLogger(FinancialPeriodValidationService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kiểm tra xem giao dịch tại một thời điểm có hợp lệ không.
   * Nếu kì tài chính cho hành động hiện tại chưa có vẫn cho qua vì trong hành động sẽ tự gọi invoice
   * Nếu kỳ tài chính chứa mốc thời gian đó đã bị CLOSED, ném ra BadRequestException.
   * Nếu kỳ tài chính trước kì hiện tại chưa đóng thì ko thể thực hiện các hành động liên quan tới kì tài chính này
   */
  async checkIsPeriodClosed(userId: string, date: Date): Promise<void> {
    const transactionDate = moment(date).startOf('day').toDate();
    const closedPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        startDate: {
          lte: transactionDate,
        },
        endDate: {
          gte: transactionDate,
        },
      },
    });
    if (!closedPeriod) {
      this.log.debug(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
        userId,
        content: 'The tax period has not yet been created.',
      });
      return;
    }

    if (closedPeriod.status === PeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Financial period "${closedPeriod.periodName}" is locked, transactions cannot be processed during this period..`,
      );
    }

    const previousOpenPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        endDate: { lte: closedPeriod.startDate },
        status: PeriodStatus.OPEN,
      },
    });

    if (previousOpenPeriod) {
      throw new BadRequestException(
        `You cannot execute a transaction in ${closedPeriod.periodName} because ${previousOpenPeriod.periodName} has not yet been closed.`,
      );
    }
  }
}
