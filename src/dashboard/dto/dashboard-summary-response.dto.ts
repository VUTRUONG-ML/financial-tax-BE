import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class RevenueProgressDto {
  @Expose()
  totalCurrentRevenue: number;

  @Expose()
  warningLevel: 'GREEN' | 'YELLOW' | 'RED';

  @Expose()
  nextThreshold: number;

  @Expose()
  percentage: number;
}

@Exclude()
export class TaxDeclarationCardDto {
  @Expose()
  periodId: string;

  @Expose()
  periodName: string;

  @Expose()
  status: string;

  @Expose()
  deadlineDate: string;

  @Expose()
  isOverdue: boolean;

  @Expose()
  daysOverdue: number;

  @Expose()
  estimatedPenalty: number;
}

@Exclude()
export class DashboardSummaryResponseDto {
  @Expose()
  @Type(() => RevenueProgressDto)
  revenueProgress: RevenueProgressDto;

  @Expose()
  @Type(() => TaxDeclarationCardDto)
  taxDeclarationCard: TaxDeclarationCardDto | null;
}
