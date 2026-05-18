import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PitMethod } from '@prisma/client';

export class CloseFinancialPeriodDto {
  @ApiPropertyOptional({ enum: PitMethod })
  @IsOptional()
  @IsEnum(PitMethod)
  chosenPitMethod?: PitMethod;
}
