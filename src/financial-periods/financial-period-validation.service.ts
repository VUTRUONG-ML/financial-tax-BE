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
    const issueDate = moment(date).toDate();

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

      // 4. CHẶN CỤC BỘ: Nếu kỳ đó là YEARLY và đã nộp tờ khai "6 tháng đầu năm", không cho phép sửa/xóa/thêm chứng từ <= 30/06
      if (currentPeriod.vatFilingPeriod === 'YEARLY') {
        const startOfYear = moment(currentPeriod.startDate).tz('Asia/Ho_Chi_Minh').startOf('year');
        const endOfFirstHalf = startOfYear.clone().month(5).endOf('month').toDate(); // 30/06

        if (issueDate <= endOfFirstHalf) {
          const taxDeclaration = await tx.taxDeclaration.findUnique({
            where: { periodId: currentPeriod.id },
          });
          const hasSubmittedFirstHalf =
            taxDeclaration && taxDeclaration.xmlContent.includes('6 tháng đầu năm');

          if (hasSubmittedFirstHalf) {
            this.log.warn(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
              status: LOG_STATUS.FAILED,
              reason: 'HALF_YEAR_PERIOD_LOCKED',
              userId,
            });
            throw new BadRequestException(
              `The transactions in the first half of the year are locked because the half-yearly tax declaration has already been submitted.`,
            );
          }
        }
      }

      this.log.debug(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId,
      });
      return currentPeriod;
    });
  }
}
