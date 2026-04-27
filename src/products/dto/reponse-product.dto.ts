import { Expose, Exclude, Transform } from 'class-transformer';
import { ProductType } from '@prisma/client';
export class ProductResponseDto {
  @Exclude() id!: number;
  @Exclude() imagePublicId!: string;
  @Exclude() updatedAt!: Date;
  @Exclude() userId!: string;

  @Expose() publicId!: string;
  @Expose() skuCode!: string;
  @Expose() productName!: string;
  @Expose() productType!: ProductType;
  @Expose() unit!: string;
  @Expose() imageUrl!: string;
  @Expose() currentStock!: number;
  @Expose() openingStockQuantity!: number;
  @Expose() createdAt!: Date;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  sellingPrice!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  openingStockUnitCost!: number;

  @Expose()
  @Transform(({ value }) => (value ? Number(value) : 0))
  openingStockValue!: number;
}
