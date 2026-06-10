import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { moment } from '../common/utils/time.util';
import { PeriodStatus } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { FinancialPeriodsService } from './financial-periods.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';

@Injectable()
export class FinancialPeriodValidationService {
  private readonly log = new AppLogger(FinancialPeriodValidationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly period: FinancialPeriodsService,
  ) { }

  /**
   * Hàm này thực hiện kiểm tra xem hành động hiện tại có thuộc một kì nào không mục đích là để kiểm tra trạng thái đã chốt hay còn mở của kì đó.
   * Nếu không tồn tại phải đi khởi tạo một kì mới chứa hành động hiện tại, ngược lại thì kiểm tra trạng thái.
   * Trước khi khởi tạo kì mới nếu kì chứa hành động hiện tại không tồn tại, thì phải kiểm tra có tồn tại kì nào trước đây chưa được chốt hay không (status = OPEN).
   * Nếu tồn tại kì trước đây chưa được chốt -> ngăn chặn.
   * @param userId
   * @param date
   * @returns FinancialPeriod
   */
  async getOrCreateAndValidatePeriod(userId: string, date: Date) {
    const issueDate = moment(date).startOf('day').toDate();

    return await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {},
      });

      // 1. Tìm kiếm kỳ tài chính chứa mốc thời gian giao dịch
      let currentPeriod = await tx.financialPeriod.findFirst({
        where: {
          userId,
          startDate: { lte: issueDate },
          endDate: { gte: issueDate },
        },
      });

      // 2. Nếu chưa có kì, tiến hành khởi tạo tự động
      if (!currentPeriod) {
        const startOfMonth = moment(issueDate).startOf('month').toDate();

        // Tìm các kì kết thúc trước tháng của issueDate (startOfMonth)
        const isPreviousOpenPeriod =
          (await tx.financialPeriod.count({
            where: {
              userId,
              endDate: { lte: startOfMonth },
              status: PeriodStatus.OPEN,
            },
          })) > 0;

        if (isPreviousOpenPeriod) {
          this.log.warn(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
            status: LOG_STATUS.FAILED,
            reason: 'PRE_OPEN_PERIOD_EXISTS',
            userId,
          });
          throw new BadRequestException(
            `Cannot create new period. Previous open period exists.`,
          );
        }

        currentPeriod = await this.period.ensurePeriodExists(
          userId,
          tx,
          issueDate,
        );
      }

      // 3. CHẶN: Nếu kỳ tài chính chứa mốc thời gian đó đã bị CLOSED
      if (currentPeriod.status === PeriodStatus.CLOSED) {
        this.log.warn(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'PERIOD_LOCKED',
          userId,
        });
        throw new BadRequestException(
          `Financial period ${currentPeriod.periodName} is locked, transactions cannot be processed during this period.`,
        );
      }
      this.log.debug(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId,
      });
      return currentPeriod;
    });
  }
}
