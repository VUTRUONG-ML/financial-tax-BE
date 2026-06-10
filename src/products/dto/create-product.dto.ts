import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @IsNotEmpty()
  @IsEnum(ProductType, {
    message: 'The product type must be FINISHED_GOOD or SERVICE',
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
  @Type(() => Number)
  openingStockQuantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  openingStockUnitCost!: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  taxCategoryId?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isInventoryTracked?: boolean;
}
