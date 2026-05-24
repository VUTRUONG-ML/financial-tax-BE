import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { PitMethod } from '@prisma/client';
import { Type } from 'class-transformer';

export class CloseFinancialPeriodDto {
  @ApiPropertyOptional({ enum: PitMethod })
  @IsOptional()
  @IsEnum(PitMethod)
  chosenPitMethod?: PitMethod;

  @ApiPropertyOptional({
    description: 'Declared taxable revenue',
    type: Number,
  })

  // Revenue và expense được nhận từ service khác
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  revenue?: number;

  @ApiPropertyOptional({
    description: 'Declared deductible expense',
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  expense?: number;
}
