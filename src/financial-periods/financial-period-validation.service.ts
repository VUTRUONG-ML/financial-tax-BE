import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { moment } from '../common/utils/time.util';
import { PeriodStatus } from '@prisma/client';

@Injectable()
export class FinancialPeriodValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kiểm tra xem giao dịch tại một thời điểm có hợp lệ không.
   * Nếu kỳ tài chính chứa mốc thời gian đó đã bị CLOSED, ném ra BadRequestException.
   */
  async checkIsPeriodClosed(userId: string, date: Date): Promise<void> {
    const transactionDateUTC = moment(date).utc().toDate();
    const closedPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        startDate: {
          lte: transactionDateUTC,
        },
        endDate: {
          gte: transactionDateUTC,
        },
      },
    });
    if (!closedPeriod) {
      throw new NotFoundException(
        'Financial period not found. Please configure the tax settings before use.',
      );
    }

    if (closedPeriod.status === PeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Financial period "${closedPeriod.periodName}" is locked, transactions cannot be processed during this period..`,
      );
    }
  }
}
