import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  NotEquals,
} from 'class-validator';
import { PaymentMethod, StockReceiptSourceType } from '@prisma/client';

export class UpdateStockReceiptDto {
  @IsString()
  @IsOptional()
  note?: string;

  @IsEnum(StockReceiptSourceType)
  @IsOptional()
  @NotEquals('OPENING', {
    message: 'Users are not allowed to create or edit OPENING type documents.',
  })
  sourceType?: StockReceiptSourceType;

  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @IsOptional()
  linkInvoicePublicId?: string;

  @IsString()
  @IsOptional()
  unlinkInvoicePublicId?: string;
}
