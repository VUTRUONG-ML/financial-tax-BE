import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class InventoryItemDto {
  @ApiProperty({ description: 'Public ID of the product' })
  @IsString()
  productPublicId: string;

  @ApiProperty()
  @IsNumber()
  actualClosingQuantity: number;
}

export class SaveStep3Dto {
  @ApiProperty({ type: [InventoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventoryItems: InventoryItemDto[];
}
