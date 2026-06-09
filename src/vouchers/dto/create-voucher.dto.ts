import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsDateString,
} from 'class-validator';
import { PaymentMethod, VoucherType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

export class CreateVoucherDto {
  @IsEnum(VoucherType, { message: 'type must be RECEIPT or PAYMENT' })
  @IsNotEmpty()
  voucherType!: VoucherType;

  @IsInt()
  @IsNotEmpty()
  categoryId!: number;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount!: Decimal;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  @IsNotEmpty()
  @IsDateString()
  transactionAt!: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsBoolean()
  @IsOptional()
  isDeductibleExpense?: boolean;

  @IsString()
  @IsOptional()
  inboundInvoicePublicId?: string;

  @IsString()
  @IsOptional()
  outboundInvoicePublicId?: string;
}
