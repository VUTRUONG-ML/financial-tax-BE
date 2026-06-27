import { Expose, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaxFormDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  formType!: string;

  @Expose()
  @IsInt()
  @IsNotEmpty()
  periodId!: number;

  @Expose()
  @IsInt()
  @IsNotEmpty()
  taxYear!: number;

  @Expose()
  @IsString()
  @IsNotEmpty()
  xmlContent!: string;
}

export class TaxFormListItemDto {
  @Expose()
  publicId!: string;

  @Expose()
  formType!: string;

  @Expose()
  periodName!: string;

  @Expose()
  taxYear!: number;

  @Expose()
  declaredRevenue!: number;

  @Expose()
  totalTaxAmount!: number;

  @Expose()
  createdAt!: string;

  @Expose()
  pdfUrl!: string | null;

  @Expose()
  xmlContent!: string;
}
