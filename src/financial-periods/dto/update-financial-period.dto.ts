import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodStatus } from '@prisma/client';

export class UpdateFinancialPeriodDto {
  @ApiPropertyOptional({ example: 'Tháng 01/2026' })
  @IsString()
  @IsOptional()
  periodName?: string;

  @ApiPropertyOptional({ enum: PeriodStatus })
  @IsEnum(PeriodStatus)
  @IsOptional()
  status?: PeriodStatus;

  @ApiPropertyOptional({ example: '2026-02-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  actualPaymentDate?: string;
}
