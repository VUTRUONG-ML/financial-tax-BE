import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import {
  DashboardSummaryResponseDto,
  RevenueProgressDto,
  TaxDeclarationCardDto,
} from './dto/dashboard-summary-response.dto';
import { moment } from '../common/utils/time.util';
import {
  InboundInvoiceStatus,
  InvoiceStatus,
  PeriodStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

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
    // Find the oldest OPEN period
    const openPeriod = await this.prisma.financialPeriod.findFirst({
      where: {
        userId,
        status: PeriodStatus.OPEN,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    if (!openPeriod) return null;

    const deadline = moment(openPeriod.deadlineDate).startOf('day');
    const today = moment().startOf('day');
    const isOverdue = today.isAfter(deadline);
    const daysOverdue = isOverdue ? today.diff(deadline, 'days') : 0;
    let estimatedPenalty = 0;

    if (isOverdue) {
      const safeTaxConfig = await this.prisma.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: openPeriod.endDate },
          applyToDate: { gte: openPeriod.endDate },
        },
      });

      if (safeTaxConfig) {
        // Aggregate Invoices
        const aggregateInvoice = await this.prisma.invoice.aggregate({
          _sum: { totalPayment: true },
          where: {
            userId,
            transactionDate: {
              gte: openPeriod.startDate,
              lte: openPeriod.endDate,
            },
            status: InvoiceStatus.ISSUED,
          },
        });
        const taxableRevenue =
          aggregateInvoice._sum.totalPayment || new Decimal(0);

        // Aggregate Inbound Invoices
        const aggregateInbound = await this.prisma.inboundInvoice.aggregate({
          _sum: { totalAmount: true },
          where: {
            userId,
            transactionDate: {
              gte: openPeriod.startDate,
              lte: openPeriod.endDate,
            },
            status: InboundInvoiceStatus.ACTIVE,
          },
        });
        const expense = aggregateInbound._sum.totalAmount || new Decimal(0);

        const taxResult = this.taxEngine.calculateTotalTax(
          taxableRevenue,
          expense,
          safeTaxConfig,
        );

        if (taxResult.totalTaxDue.gt(0)) {
          const penaltyResult = this.taxEngine.calculatePenaltyAmount(
            taxResult.totalTaxDue,
            daysOverdue,
          );
          estimatedPenalty = penaltyResult.penaltyAmount.toNumber();
        }
      }
    }

    return {
      periodId: openPeriod.publicId,
      periodName: openPeriod.periodName,
      status: openPeriod.status,
      deadlineDate: moment(openPeriod.deadlineDate).format('YYYY-MM-DD'),
      isOverdue,
      daysOverdue,
      estimatedPenalty: Number(estimatedPenalty.toFixed(2)),
    };
  }
}
