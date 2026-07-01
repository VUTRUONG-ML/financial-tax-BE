import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { CreateInvoiceDetailDto } from './create-invoice-detail.dto';
import {
  CustomerType,
  DeclarationActivityType,
  PaymentMethod,
} from '@prisma/client';

export class CreateInvoiceDto {
  /**
   * true  = Bán lẻ (B2C) — buyer info có thể bỏ trống.
   * false = Bán buôn (B2B) — buyer info ko được bỏ trống (theo yêu cầu nghiệp vụ).
   * Mặc định: true
   */
  @IsBoolean()
  @IsOptional()
  isB2C?: boolean = true;

  // Thông tin người mua — luôn optional, không phụ thuộc isB2C
  @IsString()
  @IsOptional()
  buyerName?: string;

  @IsString()
  @IsOptional()
  buyerTaxCode?: string;

  @IsString()
  @IsOptional()
  buyerAddress?: string;

  @IsString()
  @IsOptional()
  buyerEmail?: string;

  @IsString()
  @IsOptional()
  buyerIdNumber?: string;

  @IsString()
  @IsOptional()
  buyerPhone?: string;

  @IsString()
  @IsOptional()
  buyerNote?: string;

  @IsEnum(CustomerType)
  @IsOptional()
  customerType?: CustomerType = CustomerType.WALK_IN;

  @IsEnum(DeclarationActivityType)
  @IsOptional()
  declarationActivityType?: DeclarationActivityType =
    DeclarationActivityType.FIXED_LOCATION;

  @IsString()
  @IsOptional()
  businessLocationCode?: string;

  @IsString()
  @IsOptional()
  businessLocationName?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsNotEmpty()
  @IsDateString()
  issueDate!: string;

  /**
   * Danh sách hàng hóa trong hóa đơn. Tối thiểu 1 dòng.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDetailDto)
  details!: CreateInvoiceDetailDto[];
}
