import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PitMethod } from '@prisma/client';
import {
  PENALTY_LATE_PAYMENT_RATE,
  TAX_EXEMPT_REVENUE_THRESHOLD,
} from './constants/tax-engine.constant';
import {
  TaxCalculationResult,
  PenaltyCalculationResult,
  PitCalculationResult,
} from './interfaces/tax-calculation-result.interface';

export interface TaxConfigParams {
  taxGroupId: number;
  chosenPitMethod: PitMethod | null;
  vatRateSnapShot: Decimal;
  pitRateSnapShot: Decimal;
}

@Injectable()
export class TaxEngineService {
  private getProfitRateForTaxGroup(
    taxGroupId: number,
    pitMethod: PitMethod | null,
  ): Decimal {
    if (pitMethod && pitMethod.startsWith('PROFIT_')) {
      const rateStr = pitMethod.split('_')[1];
      if (rateStr) return new Decimal(parseInt(rateStr, 10) / 100);
    }
    // Mặc định tỷ lệ phần trăm theo nhóm nếu người dùng không chọn đúng PROFIT_
    if (taxGroupId === 2) return new Decimal(0.15);
    if (taxGroupId === 3) return new Decimal(0.17);
    if (taxGroupId === 4) return new Decimal(0.2);
    return new Decimal(0);
  }
  /**
   * Tính Thuế GTGT (VAT)
   * Nhóm 1 (Doanh thu <= 1 tỷ) -> 0
   */
  calculateVatAmount(
    revenue: Decimal,
    taxConfig: Pick<TaxConfigParams, 'vatRateSnapShot' | 'taxGroupId'>,
    industries?: { vatRate: Decimal; revenue: Decimal }[],
  ): Decimal {
    if (
      taxConfig.taxGroupId === 1 &&
      revenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
    ) {
      return new Decimal(0);
    }
    if (industries && industries.length > 0) {
      return industries.reduce(
        (sum, ind) => sum.add(ind.revenue.mul(ind.vatRate)),
        new Decimal(0),
      );
    }
    return revenue.mul(taxConfig.vatRateSnapShot);
  }

  calculatePitAmount(
    revenue: Decimal,
    expense: Decimal,
    taxConfig: Pick<
      TaxConfigParams,
      'taxGroupId' | 'pitRateSnapShot' | 'chosenPitMethod'
    >,
    industries?: { pitRate: Decimal; revenue: Decimal }[],
  ): PitCalculationResult {
    let profitMethodAmount: Decimal | null = null;
    let percentageMethodAmount: Decimal | null = null;

    if (
      taxConfig.chosenPitMethod === 'EXEMPT' ||
      (taxConfig.taxGroupId === 1 &&
        revenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD)))
    ) {
      return { profitMethodAmount, percentageMethodAmount };
    }

    // lợi nhuận
    const profit = revenue.sub(expense);
    const profitRate = this.getProfitRateForTaxGroup(
      taxConfig.taxGroupId,
      taxConfig.chosenPitMethod,
    );
    if (profit.gt(0) && profitRate.gt(0)) {
      profitMethodAmount = profit.mul(profitRate);
    } else {
      profitMethodAmount = new Decimal(0);
    }

    // % doanh thu
    if (taxConfig.taxGroupId === 2) {
      if (industries && industries.length > 0) {
        const pitCalc = this.calculatePitPercentageMultipleIndustries(
          industries.map((ind) => ({
            pitRate: ind.pitRate,
            ytdRevenue: ind.revenue,
          })),
        );
        percentageMethodAmount = pitCalc.totalPit;
      } else {
        const taxableRevenue = Decimal.max(
          0,
          revenue.sub(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD)),
        );
        percentageMethodAmount = taxableRevenue.mul(taxConfig.pitRateSnapShot);
      }
    }

    return { profitMethodAmount, percentageMethodAmount };
  }

  // thuế TNCN cho nhiều ngành nghề
  calculatePitPercentageMultipleIndustries(
    industries: { pitRate: Decimal; ytdRevenue: Decimal }[],
    threshold: Decimal = new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD),
  ): {
    totalPit: Decimal;
    details: {
      pitRate: Decimal;
      ytdRevenue: Decimal;
      taxableRevenue: Decimal;
      pitAmount: Decimal;
    }[];
  } {
    // tổng doanh thu YTD
    const totalYtdRevenue = industries.reduce(
      (sum, ind) => sum.add(ind.ytdRevenue),
      new Decimal(0),
    );

    // theo luật thì doanh thu bé hơn ngưỡng sẽ được miễn thuế.
    if (totalYtdRevenue.lte(threshold)) {
      return {
        totalPit: new Decimal(0),
        details: industries.map((ind) => ({
          pitRate: ind.pitRate,
          ytdRevenue: ind.ytdRevenue,
          taxableRevenue: new Decimal(0),
          pitAmount: new Decimal(0),
        })),
      };
    }

    // sắp xếp để trừ đi phần doanh thu có thuế suất lớn trước
    const sorted = [...industries].sort((a, b) =>
      b.pitRate.comparedTo(a.pitRate),
    );

    let remExemption = threshold;
    const details: any[] = [];
    let totalPit = new Decimal(0);

    for (const ind of sorted) {
      const exemptionAllocated = Decimal.min(ind.ytdRevenue, remExemption); // phần miễn trừ cho 1 ngành
      const taxableRevenue = ind.ytdRevenue.sub(exemptionAllocated);
      remExemption = remExemption.sub(exemptionAllocated);

      const pitAmount = taxableRevenue.mul(ind.pitRate);
      totalPit = totalPit.add(pitAmount);

      details.push({
        pitRate: ind.pitRate,
        ytdRevenue: ind.ytdRevenue,
        taxableRevenue,
        pitAmount,
      });
    }

    return { totalPit, details };
  }

  calculatePenaltyAmount(
    taxAmount: Decimal,
    numberOfDelayDate: number,
  ): PenaltyCalculationResult {
    if (numberOfDelayDate <= 0 || taxAmount.lte(0)) {
      return { penaltyAmount: new Decimal(0) };
    }

    const penaltyAmount = taxAmount
      .mul(new Decimal(PENALTY_LATE_PAYMENT_RATE))
      .mul(new Decimal(numberOfDelayDate));

    return { penaltyAmount };
  }

  /**
   * Tính tổng hợp Thuế phải nộp cho kỳ
   */
  calculateTotalTax(
    revenue: Decimal,
    expense: Decimal,
    taxConfig: TaxConfigParams,
  ): TaxCalculationResult {
    const result = this.calculateTaxForPeriod(taxConfig, revenue, expense);
    const pitAmountDetails = this.calculatePitAmount(
      revenue,
      expense,
      taxConfig,
    );

    return {
      vatAmount: result.vatAmount,
      pitAmountDetails,
      totalTaxDue: result.totalTax,
    };
  }

  // Tính toán toàn bộ Thuế (GTGT & TNCN) cho một kỳ (hoặc lũy kế YTD)
  calculateTaxForPeriod(
    taxConfig: TaxConfigParams,
    revenue?: Decimal,
    expense?: Decimal,
    industries?: { vatRate: Decimal; pitRate: Decimal; revenue: Decimal }[],
  ): {
    vatAmount: Decimal;
    pitAmount: Decimal;
    totalTax: Decimal;
  } {
    const totalRevenue =
      industries && industries.length > 0
        ? industries.reduce((sum, ind) => sum.add(ind.revenue), new Decimal(0))
        : (revenue ?? new Decimal(0));

    const totalExpense = expense ?? new Decimal(0);

    // thuế GTGT
    const vatAmount = this.calculateVatAmount(
      totalRevenue,
      taxConfig,
      industries,
    );

    // thuế TNCN
    let pitAmount = new Decimal(0);
    if (
      taxConfig.chosenPitMethod &&
      taxConfig.chosenPitMethod !== PitMethod.EXEMPT
    ) {
      const pitAmountDetails = this.calculatePitAmount(
        totalRevenue,
        totalExpense,
        taxConfig,
        industries,
      );
      if (taxConfig.chosenPitMethod === PitMethod.PERCENTAGE) {
        pitAmount = pitAmountDetails.percentageMethodAmount ?? new Decimal(0);
      } else if (taxConfig.chosenPitMethod.startsWith('PROFIT_')) {
        pitAmount = pitAmountDetails.profitMethodAmount ?? new Decimal(0);
      }
    }

    return {
      vatAmount,
      pitAmount,
      totalTax: vatAmount.add(pitAmount),
    };
  }
}
