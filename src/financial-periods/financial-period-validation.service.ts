import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { PeriodStatus } from '@prisma/client';

@Injectable()
export class FinancialPeriodValidationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kiểm tra xem giao dịch tại một thời điểm có hợp lệ không.
   * Nếu kỳ tài chính chứa mốc thời gian đó đã bị CLOSED, ném ra BadRequestException.
   */
  async checkIsPeriodClosed(
    userId: string,
    transactionDate: Date,
  ): Promise<void> {
    const closedPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        status: PeriodStatus.CLOSED,
        startDate: {
          lte: transactionDate,
        },
        endDate: {
          gte: transactionDate,
        },
      },
    });

    if (closedPeriod) {
      throw new BadRequestException(
        `Financial period "${closedPeriod.periodName}" is locked, transactions cannot be processed during this period..`,
      );
    }
  }
}
