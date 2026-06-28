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
import { mapToDto } from 'src/common/utils/mapper.util';
import { RecentTransactionsResponseDto } from './dto/response-recent-transaction.dto';

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
    const revenueProgress = await this.calculateRevenueProgress(
      userId,
      totalCurrentRevenue,
      currentYear,
    );

    // 2. Tax Declaration Card
    const taxDeclarationCard = await this.getTaxDeclarationCard(userId);

    return {
      revenueProgress,
      taxDeclarationCard,
    };
  }

  private async calculateRevenueProgress(
    userId: string,
    revenue: number,
    currentYear: number,
  ): Promise<RevenueProgressDto> {
    const today = moment().toDate();
    let currentPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    if (!currentPeriod) {
      currentPeriod = await this.prisma.financialPeriod.findFirst({
        where: { userId },
        orderBy: { endDate: 'desc' },
      });
    }

    // Tính tăng trưởng so với năm trước
    const previousYear = currentYear - 1;
    const prevRevenueTracker = await this.prisma.revenueTracker.findUnique({
      where: { userId_year: { userId, year: previousYear } },
    });
    const previousYearRevenue = prevRevenueTracker
      ? prevRevenueTracker.revenueYtd.toNumber()
      : 0;

    let growthRate = 0;
    if (previousYearRevenue > 0) {
      growthRate =
        ((revenue - previousYearRevenue) / previousYearRevenue) * 100;
    } else if (revenue > 0) {
      growthRate = 100.0;
    }
    growthRate = Number(growthRate.toFixed(1));

    // Dự báo doanh thu YTD khi kết thúc kỳ hiện tại (ngoại suy tuyến tính số ngày từ đầu năm)
    let forecastRevenue = revenue;
    let forecastLabel = 'Dự báo';
    if (currentPeriod) {
      const yearStart = moment(`${currentYear}-01-01`).startOf('day');
      const periodEnd = moment(currentPeriod.endDate).endOf('day');
      const totalDaysToPeriodEnd = periodEnd.diff(yearStart, 'days') + 1;

      const now = moment();
      let elapsedDaysYtd = now.diff(yearStart, 'days') + 1;
      if (elapsedDaysYtd > totalDaysToPeriodEnd) {
        elapsedDaysYtd = totalDaysToPeriodEnd;
      }
      if (elapsedDaysYtd <= 0) {
        elapsedDaysYtd = 1;
      }

      forecastRevenue = Math.round((revenue / elapsedDaysYtd) * totalDaysToPeriodEnd);
      forecastLabel = `Dự báo (${currentPeriod.periodName})`;
    }

    // Xác định nhãn và thông điệp rủi ro thuế
    let alertLabel: string | null = null;
    let alertMessage: string | null = null;

    if (revenue < 1_000_000_000) {
      if (revenue >= 600_000_000) {
        alertLabel = 'SẮP ĐẠT NGƯỠNG 01 TỶ';
        alertMessage = 'Doanh thu lũy kế đang tiến sát ngưỡng 01 tỷ. Vui lòng kiểm tra lại định mức kê khai thuế TNCN & GTGT.';
      }
    } else if (revenue < 3_000_000_000) {
      if (revenue >= 2_400_000_000) {
        alertLabel = 'SẮP ĐẠT NGƯỠNG 03 TỶ';
        alertMessage = 'Doanh thu lũy kế đang tiến sát ngưỡng 03 tỷ. Vui lòng kiểm tra lại định mức kê khai thuế TNCN & GTGT.';
      } else {
        alertLabel = 'ĐÃ VƯỢT NGƯỠNG 01 TỶ';
        alertMessage = 'Doanh thu lũy kế đã vượt ngưỡng 01 tỷ. Vui lòng đảm bảo thực hiện đầy đủ nghĩa vụ kê khai thuế.';
      }
    } else {
      if (revenue >= 40_000_000_000) {
        alertLabel = 'SẮP ĐẠT NGƯỠNG 50 TỶ';
        alertMessage = 'Doanh thu lũy kế đang tiến sát ngưỡng 50 tỷ. Vui lòng kiểm tra lại định mức kê khai thuế TNCN & GTGT.';
      } else {
        alertLabel = 'ĐÃ VƯỢT NGƯỠNG 03 TỶ';
        alertMessage = 'Doanh thu lũy kế đã vượt ngưỡng 03 tỷ. Hộ kinh doanh thuộc nhóm kê khai thuế bắt buộc.';
      }
    }

    let warningLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    let nextThreshold = 1_000_000_000;

    if (revenue < 1_000_000_000) {
      warningLevel = 'GREEN';
      nextThreshold = 1_000_000_000;
    } else if (revenue < 3_000_000_000) {
      warningLevel = 'YELLOW';
      nextThreshold = 3_000_000_000;
    } else {
      warningLevel = 'RED';
      nextThreshold = 50_000_000_000;
    }

    let percentage = (revenue / nextThreshold) * 100;
    if (percentage > 100) percentage = 100; // Cap at 100%

    return {
      totalCurrentRevenue: revenue,
      warningLevel,
      nextThreshold,
      percentage: Number(percentage.toFixed(2)),
      growthRate,
      forecastRevenue,
      forecastLabel,
      alertLabel,
      alertMessage,
    };
  }

  private async getTaxDeclarationCard(
    userId: string,
  ): Promise<TaxDeclarationCardDto | null> {
    const today = moment().startOf('day');

    // Ưu tiên tìm kỳ tài chính CHƯA nộp thuế (actualPaymentDate == null) cũ nhất để thúc đẩy xử lý
    let targetPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        actualPaymentDate: null,
      },
      orderBy: {
        startDate: 'asc',
      },
    });
    if (!targetPeriod) {
      targetPeriod = await this.prisma.financialPeriod.findFirst({
        where: {
          userId,
          actualPaymentDate: { not: null },
        },
        orderBy: {
          endDate: 'desc',
        },
      });
    }

    if (!targetPeriod) return null;

    const deadline = moment(targetPeriod.deadlineDate).startOf('day');
    const endDate = moment(targetPeriod.endDate).endOf('day');

    const isOverdue = today.isAfter(deadline);
    const daysOverdue = isOverdue ? today.diff(deadline, 'days') : 0;

    let displayStatus: string = targetPeriod.status; // Mặc định trả về OPEN hoặc CLOSED

    if (
      today.isAfter(endDate) &&
      (today.isSame(deadline) || today.isBefore(deadline)) &&
      targetPeriod.status === PeriodStatus.OPEN
    ) {
      displayStatus = 'PENDING_CLOSURE'; // Hết kỳ, trong hạn, chưa chốt
    } else if (isOverdue && targetPeriod.status === PeriodStatus.OPEN) {
      displayStatus = 'OVERDUE_NO_DATA'; // Quá hạn chót nhưng VẪN CHƯA CHỐT SỔ
    } else if (isOverdue && targetPeriod.status === PeriodStatus.CLOSED) {
      displayStatus = 'OVERDUE_WITH_DATA'; // Quá hạn chót, ĐÃ CHỐT SỔ
    }

    let estimatedPenalty = 0;

    // Chỉ tính tiền phạt khi thực sự quá hạn VÀ đã có số liệu thuế chính thức (Kỳ đã CLOSED)
    if (isOverdue && targetPeriod.status === PeriodStatus.CLOSED) {
      if (targetPeriod.taxAmount.gt(0)) {
        const penaltyResult = this.taxEngine.calculatePenaltyAmount(
          targetPeriod.taxAmount,
          daysOverdue,
        );
        estimatedPenalty = penaltyResult.penaltyAmount.toNumber();
      }
    }

    // Xác định statusLabel và description
    let statusLabel = 'CHƯA HOÀN THÀNH';
    let description = '';
    const actualPaymentDate = targetPeriod.actualPaymentDate
      ? moment(targetPeriod.actualPaymentDate).format('YYYY-MM-DD')
      : null;

    if (targetPeriod.actualPaymentDate) {
      statusLabel = 'ĐÃ HOÀN THÀNH';
      description = `${targetPeriod.periodName} đã ghi nhận ngày nộp ${actualPaymentDate}. Tiền chậm nộp đã được đóng băng.`;
    } else {
      if (isOverdue) {
        statusLabel = 'TRỄ HẠN';
        description = `${targetPeriod.periodName} đã quá hạn nộp thuế từ ngày ${deadline.format('YYYY-MM-DD')}. Vui lòng hoàn thành nộp thuế để tránh phát sinh thêm tiền chậm nộp.`;
      } else {
        statusLabel = 'CHƯA HOÀN THÀNH';
        description = `${targetPeriod.periodName} có hạn nộp thuế đến ngày ${deadline.format('YYYY-MM-DD')}. Vui lòng nộp thuế đúng hạn.`;
      }
    }

    return {
      periodId: targetPeriod.publicId,
      periodName: targetPeriod.periodName,
      status: displayStatus,
      statusLabel,
      deadlineDate: deadline.format('YYYY-MM-DD'),
      isOverdue,
      daysOverdue,
      estimatedPenalty: Number(estimatedPenalty.toFixed(2)),
      description,
      actualPaymentDate,
    };
  }

  async recentTransaction(userId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        userId,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return mapToDto(RecentTransactionsResponseDto, invoices);
  }
}
