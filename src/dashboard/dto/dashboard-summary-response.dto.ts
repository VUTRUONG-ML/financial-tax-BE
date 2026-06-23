import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class RevenueProgressDto {
  @Expose()
  totalCurrentRevenue!: number;

  @Expose()
  warningLevel!: 'GREEN' | 'YELLOW' | 'RED';

  @Expose()
  nextThreshold!: number;

  @Expose()
  percentage!: number;

  @Expose()
  growthRate!: number;

  @Expose()
  forecastRevenue!: number;

  @Expose()
  forecastLabel!: string;

  @Expose()
  alertLabel!: string | null;

  @Expose()
  alertMessage!: string | null;
}

@Exclude()
export class TaxDeclarationCardDto {
  @Expose()
  periodId!: string;

  @Expose()
  periodName!: string;

  @Expose()
  status!: string;

  @Expose()
  statusLabel!: string;

  @Expose()
  deadlineDate!: string;

  @Expose()
  isOverdue!: boolean;

  @Expose()
  daysOverdue!: number;

  @Expose()
  estimatedPenalty!: number;

  @Expose()
  description!: string;

  @Expose()
  actualPaymentDate!: string | null;
}

@Exclude()
export class DashboardSummaryResponseDto {
  @Expose()
  @Type(() => RevenueProgressDto)
  revenueProgress!: RevenueProgressDto;

  @Expose()
  @Type(() => TaxDeclarationCardDto)
  taxDeclarationCard!: TaxDeclarationCardDto | null;
}
