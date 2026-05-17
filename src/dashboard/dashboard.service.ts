import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import {
  DashboardSummaryResponseDto,
  RevenueProgressDto,
  TaxDeclarationCardDto,
} from './dto/dashboard-summary-response.dto';
import { moment } from '../common/utils/time.util';
import { PeriodStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxEngine: TaxEngineService,
  ) {}

  async getSummary(userId: string): Promise<DashboardSummaryResponseDto> {
    const currentYear = moment().year();

    // 1. Revenue Progress
    const revenueTracker = await this.prisma.revenueTracker.findUnique({
      where: { userId_year: { userId, year: currentYear } },
    });

    const totalCurrentRevenue = revenueTracker
      ? revenueTracker.revenueYtd.toNumber()
      : 0;
    const revenueProgress = this.calculateRevenueProgress(totalCurrentRevenue);

    // 2. Tax Declaration Card
    const taxDeclarationCard = await this.getTaxDeclarationCard(userId);

    return {
      revenueProgress,
      taxDeclarationCard,
    };
  }

  private calculateRevenueProgress(revenue: number): RevenueProgressDto {
    let warningLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    let nextThreshold = 500_000_000;

    if (revenue < 500_000_000) {
      warningLevel = 'GREEN';
      nextThreshold = 500_000_000;
    } else if (revenue < 3_000_000_000) {
      warningLevel = 'YELLOW';
      nextThreshold = 3_000_000_000;
    } else {
      warningLevel = 'RED';
      nextThreshold = 50_000_000_000;
    }

    let percentage = (revenue / nextThreshold) * 100;
    if (percentage > 100) percentage = 100; // Cap at 100% if >= 50B

    return {
      totalCurrentRevenue: revenue,
      warningLevel,
      nextThreshold,
      percentage: Number(percentage.toFixed(2)),
    };
  }

  private async getTaxDeclarationCard(
    userId: string,
  ): Promise<TaxDeclarationCardDto | null> {
    const today = moment().startOf('day');

    // VÁ LỖI 1: Tìm kỳ cũ nhất chưa hoàn thành (Bao gồm cả OPEN - chưa chốt và LOCKED - đã chốt nhưng chưa nộp tiền)
    const targetPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
      },
      orderBy: {
        startDate: 'asc', // Luôn ưu tiên xử lý dứt điểm kỳ cũ trước
      },
    });

    if (!targetPeriod) return null;

    const deadline = moment(targetPeriod.deadlineDate).startOf('day');
    const endDate = moment(targetPeriod.endDate).startOf('day');

    const isOverdue = today.isAfter(deadline);
    const daysOverdue = isOverdue ? today.diff(deadline, 'days') : 0;

    let displayStatus: string = targetPeriod.status; // Mặc định trả về OPEN hoặc CLOSE

    if (
      today.isAfter(endDate) &&
      (today.isSame(deadline) || today.isBefore(deadline)) &&
      targetPeriod.status === PeriodStatus.OPEN
    ) {
      displayStatus = 'PENDING_CLOSURE'; // Hết kỳ, trong hạn, chưa chốt
    } else if (isOverdue && targetPeriod.status === PeriodStatus.OPEN) {
      displayStatus = 'OVERDUE_NO_DATA'; // Quá hạn chót nhưng VẪN CHƯA CHỐT SỔ -> Ép đi chốt sổ
    } else if (isOverdue && targetPeriod.status === PeriodStatus.CLOSED) {
      displayStatus = 'OVERDUE_WITH_DATA'; // Quá hạn chót, ĐÃ CHỐT SỔ -> Có data để tính phạt chính xác
    }

    let estimatedPenalty = 0;

    // Chỉ tính tiền phạt khi thực sự quá hạn VÀ đã có số liệu thuế chính thức (Kỳ đã LOCKED)
    if (isOverdue && targetPeriod.status === PeriodStatus.CLOSED) {
      if (targetPeriod.taxAmount.gt(0)) {
        const penaltyResult = this.taxEngine.calculatePenaltyAmount(
          targetPeriod.taxAmount,
          daysOverdue,
        );
        estimatedPenalty = penaltyResult.penaltyAmount.toNumber();
      }
    }

    return {
      periodId: targetPeriod.publicId,
      periodName: targetPeriod.periodName,
      status: displayStatus, // Trả về mã trạng thái hiển thị động chuẩn chỉnh
      deadlineDate: deadline.format('YYYY-MM-DD'),
      isOverdue,
      daysOverdue,
      estimatedPenalty: Number(estimatedPenalty.toFixed(2)),
    };
  }
}
