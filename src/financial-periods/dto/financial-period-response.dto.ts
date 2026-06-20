import { Expose, Transform } from 'class-transformer';
import { PeriodStatus } from '@prisma/client';
import { moment } from 'src/common/utils/time.util';

export class FinancialPeriodResponseDto {
  @Expose()
  publicId!: string;

  @Expose()
  periodName!: string;

  @Expose()
  startDate!: Date;

  @Expose()
  endDate!: Date;

  @Expose()
  deadlineDate!: Date;

  @Expose()
  status!: PeriodStatus;

  @Expose()
  actualPaymentDate!: Date | null;

  @Expose()
  createdAt!: Date;

  @Expose()
  updatedAt!: Date;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  taxAmount!: number;

  @Expose()
  @Transform(({ value }) => value == null ? null : Number(value))
  vatAmount!: number | null;

  @Expose()
  @Transform(({ value }) => value == null ? null : Number(value))
  pitAmount!: number | null;

  @Expose()
  @Transform(({ obj }) =>
    obj.actualPaymentDate
      ? moment(obj.actualPaymentDate).diff(obj.deadlineDate, 'day')
      : moment().diff(obj.deadlineDate, 'day') > 0
        ? moment().diff(obj.deadlineDate, 'day') : 0,
  )
  countExpireDate!: number;

  @Expose()
  @Transform(({ obj }) =>
    !obj.actualPaymentDate || moment().isAfter(obj.deadlineDate) ? false : true)
  isFinishedTaxPayment!: boolean;
}
