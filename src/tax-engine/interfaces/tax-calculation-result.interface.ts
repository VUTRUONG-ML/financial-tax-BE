import { Decimal } from '@prisma/client/runtime/client';

export interface PitCalculationResult {
  profitMethodAmount: Decimal | null; // Null nếu không áp dụng
  percentageMethodAmount: Decimal | null; // Null nếu không áp dụng
}

export interface TaxCalculationResult {
  vatAmount: Decimal;
  pitAmountDetails: PitCalculationResult;
  totalTaxDue: Decimal; // VAT + finalPitAmount
}

export interface PenaltyCalculationResult {
  penaltyAmount: Decimal;
}
