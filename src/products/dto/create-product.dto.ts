import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  openingStockQuantity?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  openingStockUnitCost?: number = 0;
}
