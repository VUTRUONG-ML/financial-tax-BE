import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsBoolean,
  NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockReceiptSourceType } from '@prisma/client';

export class StockReceiptItemDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsNumber()
  @Min(0.001)
  @IsNotEmpty()
  quantity!: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  unitCost!: number;
}

export class CreateStockReceiptDto {
  @IsEnum(StockReceiptSourceType)
  @IsNotEmpty()
  @NotEquals('OPENING', { message: 'Users are not allowed to create or edit OPENING type documents.' })
  sourceType!: StockReceiptSourceType;

  @IsDateString()
  @IsNotEmpty()
  receiptDate!: string;

  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsString()
  @IsOptional()
  sourceInvoiceNo?: string;

  @IsString()
  @IsOptional()
  sourceDocumentUrl?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemDto)
  @IsNotEmpty()
  products!: StockReceiptItemDto[];
}
