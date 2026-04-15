import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  productName!: string;

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
