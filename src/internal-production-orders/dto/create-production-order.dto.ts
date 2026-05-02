import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductionTransactionType } from '@prisma/client';

export class ProductionDetailDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsEnum(ProductionTransactionType, {
    message: 'The transaction type must be ISSUE_MATERIAL, RECEIVE_PRODUCT',
  })
  @IsNotEmpty()
  transactionType!: ProductionTransactionType;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity!: number;
}

export class CreateProductionOrderDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionDetailDto)
  @IsNotEmpty()
  details!: ProductionDetailDto[];
}
