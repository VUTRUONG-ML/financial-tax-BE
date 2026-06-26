import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { StockReceiptSourceType } from '@prisma/client';

export class UpdateStockReceiptDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsEnum(StockReceiptSourceType)
  @IsOptional()
  sourceType?: StockReceiptSourceType;

  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsString()
  @IsOptional()
  linkInvoicePublicId?: string;

  @IsString()
  @IsOptional()
  unlinkInvoicePublicId?: string;
}
