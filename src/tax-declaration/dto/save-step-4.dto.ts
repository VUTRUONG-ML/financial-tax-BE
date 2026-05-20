import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveStep4Dto {
  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  totalExpense: number;
}
