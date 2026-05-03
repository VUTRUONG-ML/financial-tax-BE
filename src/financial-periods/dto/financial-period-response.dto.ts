import { ApiProperty } from '@nestjs/swagger';
import { FinancialPeriod, PeriodStatus } from '@prisma/client';

export class FinancialPeriodResponseDto {
  @ApiProperty()
  publicId: string;

  @ApiProperty()
  periodName: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  deadlineDate: Date;

  @ApiProperty({ enum: PeriodStatus })
  status: PeriodStatus;

  @ApiProperty()
  taxAmount: number;

  @ApiProperty({ required: false, nullable: true })
  actualPaymentDate: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(partial: Partial<FinancialPeriod>) {
    this.publicId = partial.publicId!;
    this.periodName = partial.periodName!;
    this.startDate = partial.startDate!;
    this.endDate = partial.endDate!;
    this.deadlineDate = partial.deadlineDate!;
    this.status = partial.status!;
    this.taxAmount = partial.taxAmount ? Number(partial.taxAmount) : 0;
    this.actualPaymentDate = partial.actualPaymentDate ?? null;
    this.createdAt = partial.createdAt!;
    this.updatedAt = partial.updatedAt!;
  }
}
