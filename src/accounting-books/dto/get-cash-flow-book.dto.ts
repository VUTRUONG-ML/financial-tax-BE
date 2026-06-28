import { IsEnum, IsOptional } from 'class-validator';
import { GetRevenueBookDto } from './get-revenue-book.dto';

export enum CashFlowMethod {
  ALL = 'ALL',
  CASH = 'CASH',
  BANK = 'BANK',
}

export class GetCashFlowBookDto extends GetRevenueBookDto {
  @IsEnum(CashFlowMethod)
  @IsOptional()
  method?: CashFlowMethod;
}
