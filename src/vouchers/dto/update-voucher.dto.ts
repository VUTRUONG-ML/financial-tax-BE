import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsDateString,
  IsEnum as IsEnumAlias,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class UpdateVoucherDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsDateString()
  @IsOptional()
  transactionAt?: string;

  @IsString()
  @IsOptional()
  contactName?: string;
}
