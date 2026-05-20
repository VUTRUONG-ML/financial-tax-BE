import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PitMethod, TaxConfiguration } from '@prisma/client';
import {
  PENALTY_LATE_PAYMENT_RATE,
  TAX_EXEMPT_REVENUE_THRESHOLD,
} from './constants/tax-engine.constant';
import {
  TaxCalculationResult,
  PenaltyCalculationResult,
  PitCalculationResult,
} from './interfaces/tax-calculation-result.interface';

@Injectable()
export class TaxEngineService {
  /**
   * Tính Thuế GTGT (VAT)
   * Nhóm 1 (Doanh thu <= 500 triệu) -> 0
   */
  calculateVatAmount(
    revenue: Decimal,
    taxConfig: Pick<TaxConfiguration, 'vatRateSnapShot' | 'taxGroupId'>,
  ): Decimal {
    if (
      taxConfig.taxGroupId === 1 &&
      revenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD))
    ) {
      return new Decimal(0);
    }
    return revenue.mul(taxConfig.vatRateSnapShot);
  }

  /**
   * Lấy tỷ lệ phần trăm từ pitMethod (Ví dụ: PROFIT_15 -> 0.15)
   */
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
   * Tính Thuế TNCN (PIT)
   */
  calculatePitAmount(
    revenue: Decimal,
    expense: Decimal,
    taxConfig: Pick<
      TaxConfiguration,
      'taxGroupId' | 'pitRateSnapShot' | 'chosenPitMethod'
    >,
  ): PitCalculationResult {
    let profitMethodAmount: Decimal | null = null;
    let percentageMethodAmount: Decimal | null = null;

    // Miễn thuế hoặc Nhóm 1 (Doanh thu <= 500 triệu)
    if (
      taxConfig.chosenPitMethod === 'EXEMPT' ||
      (taxConfig.taxGroupId === 1 &&
        revenue.lte(new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD)))
    ) {
      return { profitMethodAmount, percentageMethodAmount };
    }

    // Tính Lợi nhuận (Cách 1) - Luôn có thể tính được nếu có tỷ lệ lợi nhuận cho nhóm này
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

    // Nếu là Nhóm 2, bắt buộc tính Cách 2 (Tính % trên doanh thu > 500tr)
    if (taxConfig.taxGroupId === 2) {
      const taxableRevenue = revenue.sub(
        new Decimal(TAX_EXEMPT_REVENUE_THRESHOLD),
      );
      if (taxableRevenue.gt(0)) {
        percentageMethodAmount = taxableRevenue.mul(taxConfig.pitRateSnapShot);
      } else {
        percentageMethodAmount = new Decimal(0);
      }
    }

    return { profitMethodAmount, percentageMethodAmount };
  }

  /**
   * Tính Tiền phạt chậm nộp
   * Tiền phạt = taxAmount x 0.03% x numberOfDelayDate
   */
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
    taxConfig: Pick<
      TaxConfiguration,
      'taxGroupId' | 'vatRateSnapShot' | 'pitRateSnapShot' | 'chosenPitMethod'
    >,
  ): TaxCalculationResult {
    const vatAmount = this.calculateVatAmount(revenue, taxConfig);
    const pitAmountDetails = this.calculatePitAmount(
      revenue,
      expense,
      taxConfig,
    );

    let finalPitAmount = new Decimal(0);
    if (
      taxConfig.chosenPitMethod === 'PERCENTAGE' &&
      taxConfig.taxGroupId === 2
    ) {
      finalPitAmount =
        pitAmountDetails.percentageMethodAmount ?? new Decimal(0);
    } else if (
      taxConfig.chosenPitMethod &&
      taxConfig.chosenPitMethod.startsWith('PROFIT_')
    ) {
      finalPitAmount = pitAmountDetails.profitMethodAmount ?? new Decimal(0);
    }

    const totalTaxDue = vatAmount.add(finalPitAmount);

    return {
      vatAmount,
      pitAmountDetails,
      totalTaxDue,
    };
  }
}
