import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductionItemDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity!: number;
}

export class CreateProductionOrderDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  transactionAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionItemDto)
  @IsNotEmpty()
  materials!: ProductionItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionItemDto)
  @IsNotEmpty()
  products!: ProductionItemDto[];
}
