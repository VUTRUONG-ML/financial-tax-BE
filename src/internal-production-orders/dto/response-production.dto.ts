import { Expose, Transform, Type } from 'class-transformer';
import { ProductionTransactionType } from '@prisma/client';

export class ProductionDetailResponseDto {
  @Expose()
  id!: number;

  @Expose()
  transactionType!: ProductionTransactionType; // ISSUE_MATERIAL hoặc RECEIVE_PRODUCT

  @Expose()
  quantity!: number;

  // product
  @Expose()
  @Transform(({ obj }) => obj.product?.publicId)
  productPublicId!: string;

  @Expose()
  @Transform(({ obj }) => obj.product?.productName)
  productName!: string;

  @Expose()
  @Transform(({ obj }) => obj.product?.skuCode)
  skuCode!: string;
}

export class ProductionOrderResponseDto {
  @Expose()
  orderCode!: string; // Định danh chính thay cho ID

  @Expose()
  notes!: string;

  @Expose()
  createdAt!: Date;

  // Giấu toàn bộ id, userId và updatedAt theo yêu cầu của ông

  @Expose()
  @Type(() => ProductionDetailResponseDto)
  details!: ProductionDetailResponseDto[];
}
