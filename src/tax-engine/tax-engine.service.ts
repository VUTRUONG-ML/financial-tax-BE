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
    taxConfig: Pick<TaxConfigParams, 'vatRateSnapShot' | 'taxGroupId'>,
    input: Decimal | { vatRate: Decimal; revenue: Decimal }[],
  ): Decimal {
    if (input instanceof Decimal) {
      if (
        taxConfig.taxGroupId === 1 &&
        input.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
      ) {
        return new Decimal(0);
      }
      return input.mul(taxConfig.vatRateSnapShot);
    } else {
      const totalRevenue = input.reduce(
        (sum, ind) => sum.add(ind.revenue),
        new Decimal(0),
      );
      if (
        taxConfig.taxGroupId === 1 &&
        totalRevenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
      ) {
        return new Decimal(0);
      }
      return input.reduce(
        (sum, ind) => sum.add(ind.revenue.mul(ind.vatRate)),
        new Decimal(0),
      );
    }
  }

  calculatePitPercentage(
    taxConfig: Pick<TaxConfigParams, 'taxGroupId' | 'pitRateSnapShot'>,
    input: Decimal | { pitRate: Decimal; revenue: Decimal }[],
  ): Decimal {
    if (input instanceof Decimal) {
      if (
        taxConfig.taxGroupId === 1 &&
        input.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
      ) {
        return new Decimal(0);
      }
      if (taxConfig.taxGroupId === 2) {
        const taxableRevenue = Decimal.max(
          0,
          input.sub(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD)),
        );
        return taxableRevenue.mul(taxConfig.pitRateSnapShot);
      }
    } else {
      const totalRevenue = input.reduce(
        (sum, ind) => sum.add(ind.revenue),
        new Decimal(0),
      );
      if (
        taxConfig.taxGroupId === 1 &&
        totalRevenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
      ) {
        return new Decimal(0);
      }
      if (taxConfig.taxGroupId === 2) {
        const pitCalc = this.calculatePitPercentageMultipleIndustries(
          input.map((ind) => ({
            pitRate: ind.pitRate,
            ytdRevenue: ind.revenue,
          })),
        );
        return pitCalc.totalPit;
      }
    }
    return new Decimal(0);
  }

  calculatePitProfitForPeriod(
    taxConfig: Pick<TaxConfigParams, 'taxGroupId' | 'chosenPitMethod'>,
    periodRevenue: Decimal,
    periodExpense: Decimal,
  ): Decimal {
    return this.calculatePitProfitCommon(
      taxConfig,
      periodRevenue,
      periodExpense,
    );
  }

  calculatePitProfitForYtd(
    taxConfig: Pick<TaxConfigParams, 'taxGroupId' | 'chosenPitMethod'>,
    ytdRevenue: Decimal,
    ytdExpense: Decimal,
  ): Decimal {
    return this.calculatePitProfitCommon(taxConfig, ytdRevenue, ytdExpense);
  }

  private calculatePitProfitCommon(
    taxConfig: Pick<TaxConfigParams, 'taxGroupId' | 'chosenPitMethod'>,
    revenue: Decimal,
    expense: Decimal,
  ): Decimal {
    if (
      taxConfig.chosenPitMethod === 'EXEMPT' ||
      (taxConfig.taxGroupId === 1 &&
        revenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD)))
    ) {
      return new Decimal(0);
    }

    const profit = revenue.sub(expense);
    const profitRate = this.getProfitRateForTaxGroup(
      taxConfig.taxGroupId,
      taxConfig.chosenPitMethod,
    );

    if (profit.gt(0) && profitRate.gt(0)) {
      return profit.mul(profitRate);
    }

    return new Decimal(0);
  }

  calculatePitAmount(
    taxConfig: Pick<
      TaxConfigParams,
      'taxGroupId' | 'pitRateSnapShot' | 'chosenPitMethod'
    >,
    inPeriodRevenue: Decimal,
    inPeriodExpense: Decimal,
    ytdInput: Decimal | { pitRate: Decimal; revenue: Decimal }[],
  ): PitCalculationResult {
    if (taxConfig.chosenPitMethod === 'EXEMPT') {
      return { profitMethodAmount: null, percentageMethodAmount: null };
    }

    const profitMethodAmount = this.calculatePitProfitForPeriod(
      taxConfig,
      inPeriodRevenue,
      inPeriodExpense,
    );
    const percentageMethodAmount = this.calculatePitPercentage(
      taxConfig,
      ytdInput,
    );

    return { profitMethodAmount, percentageMethodAmount };
  }

  // thuế TNCN cho nhiều ngành nghề
  calculatePitPercentageMultipleIndustries(
    industries: { pitRate: Decimal; ytdRevenue: Decimal; taxCategoryId?: number }[],
    threshold: Decimal = new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD),
  ): {
    totalPit: Decimal;
    details: {
      pitRate: Decimal;
      ytdRevenue: Decimal;
      taxableRevenue: Decimal;
      pitAmount: Decimal;
      taxCategoryId?: number;
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
          taxCategoryId: ind.taxCategoryId,
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
        taxCategoryId: ind.taxCategoryId,
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
}
