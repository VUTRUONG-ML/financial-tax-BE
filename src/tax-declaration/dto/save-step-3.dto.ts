import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventoryItemDto {
  @ApiProperty({ description: 'Public ID of the product' })
  @IsString()
  @IsNotEmpty()
  productPublicId: string;

  @ApiProperty({ description: 'Actual physical closing stock quantity (>= 0)' })
  @IsInt({ message: 'actualClosingQuantity must be an integer' })
  @Min(0, { message: 'actualClosingQuantity must not be negative' })
  actualClosingQuantity: number;
}

export class SaveStep3Dto {
  @ApiProperty({ type: [InventoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventoryItems: InventoryItemDto[];
}
