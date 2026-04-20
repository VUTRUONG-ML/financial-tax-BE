import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @IsNotEmpty()
  @IsEnum(ProductType, {
    message: 'The product type must be FINISHED_GOOD, RAW_MATERIAL, or SERVICE',
  })
  productType!: ProductType;

  @IsString()
  @IsOptional()
  skuCode?: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sellingPrice!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  openingStockQuantity?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  openingStockUnitCost?: number = 0;
}
