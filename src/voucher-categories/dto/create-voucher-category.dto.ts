import { IsEnum, IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';
import { VoucherType, S2cExpenseMapping } from '@prisma/client';

export class CreateVoucherCategoryDto {
  @IsEnum(VoucherType, { message: 'type must be RECEIPT or PAYMENT' })
  @IsNotEmpty()
  type!: VoucherType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  categoryName!: string;

  @IsEnum(S2cExpenseMapping)
  @IsOptional()
  s2cExpenseMapping?: S2cExpenseMapping;
}
