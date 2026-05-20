import { IsDateString, IsDecimal, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFinancialPeriodDto {
  @ApiProperty({ example: 'Tháng 01/2026' })
  @IsString()
  @IsNotEmpty()
  periodName: string;

  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2026-01-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ example: '2026-02-20T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  deadlineDate: string;

  @ApiProperty({ example: 1000000 })
  @IsDecimal()
  @IsNotEmpty()
  taxAmount: number | string;
}
