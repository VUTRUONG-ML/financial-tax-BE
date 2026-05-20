import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveStep2Dto {
  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  confirmedRevenue: number;
}
