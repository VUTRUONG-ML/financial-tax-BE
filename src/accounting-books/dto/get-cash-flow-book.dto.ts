import { IsEnum, IsOptional } from 'class-validator';
import { GetRevenueBookDto } from './get-revenue-book.dto';

export enum CashFlowBookKey {
  S03 = 'S03',
  S04 = 'S04',
}

export class GetCashFlowBookDto extends GetRevenueBookDto {
  @IsEnum(CashFlowBookKey)
  @IsOptional()
  bookKey?: CashFlowBookKey;
}
