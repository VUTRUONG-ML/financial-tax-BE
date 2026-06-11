import { Expose, Transform, Type } from 'class-transformer';
import {
  StockIssueType,
  StockIssueStatus,
  CogsPostedStatus,
} from '@prisma/client';

export class StockIssueDetailResponseDto {
  @Expose()
  @Transform(
    ({ obj }) => (obj as { product?: { publicId: string } }).product?.publicId,
  )
  productPublicId!: string;

  @Expose()
  @Transform(
    ({ obj }) =>
      (obj as { product?: { productName: string } }).product?.productName,
  )
  productName!: string;

  @Expose()
  @Transform(
    ({ obj }) => (obj as { product?: { skuCode?: string } }).product?.skuCode,
  )
  skuCode!: string;

  @Expose()
  @Transform(({ value }) => Number(value))
  quantity!: number;

  @Expose()
  @Transform(({ value }) => (value !== null ? Number(value) : null))
  provisionalUnitCost?: number;

  @Expose()
  @Transform(({ value }) => (value !== null ? Number(value) : null))
  finalWeightedUnitCost?: number;

  @Expose()
  @Transform(({ value }) => (value !== null ? Number(value) : null))
  finalCogsValue?: number;

  @Expose()
  cogsPostedToS2c!: CogsPostedStatus;
}

export class StockIssueResponseDto {
  @Expose()
  id!: number;

  @Expose()
  issueCode!: string;

  @Expose()
  issueDate!: Date;

  @Expose()
  issueType!: StockIssueType;

  @Expose()
  sourceDocumentType?: string;

  @Expose()
  sourceDocumentId?: number;

  @Expose()
  status!: StockIssueStatus;

  @Expose()
  @Transform(
    ({ obj }) =>
      (obj as { period?: { periodName?: string } }).period?.periodName,
  )
  periodName!: string;

  @Expose()
  createdAt!: Date;

  @Expose()
  @Type(() => StockIssueDetailResponseDto)
  details!: StockIssueDetailResponseDto[];
}
