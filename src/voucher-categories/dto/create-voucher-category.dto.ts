import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { VoucherType } from '@prisma/client';

export class CreateVoucherCategoryDto {
  @IsEnum(VoucherType, { message: 'type must be RECEIPT or PAYMENT' })
  @IsNotEmpty()
  type!: VoucherType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  categoryName!: string;
}
