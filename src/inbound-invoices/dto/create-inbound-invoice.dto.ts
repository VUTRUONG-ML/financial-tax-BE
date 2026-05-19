import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNumber,
  IsInt,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInboundInvoiceItemDto {
  @IsNotEmpty()
  @IsString()
  productPublicId!: string; // ID public sản phẩm đã có trong danh mục

  @IsNotEmpty()
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity!: number; // Số lượng nhập vật lý

  @IsNotEmpty()
  @IsNumber()
  @Min(0, { message: 'unitCost must not be negative' })
  unitCost!: number; // Đơn giá mua vào
}

export class CreateInboundInvoiceDto {
  @IsNotEmpty()
  @IsString()
  sellerName!: string; // Tên nhà cung cấp/người bán

  @IsOptional()
  @IsString()
  sellerTaxCode?: string; // MST người bán (nếu có)

  @IsNotEmpty()
  @IsString()
  invoiceNo!: string; // Số hóa đơn từ người bán

  @IsNotEmpty()
  @IsDateString()
  issueDate!: string; // Ngày xuất hóa đơn ghi trên chứng từ

  @IsOptional()
  @IsString()
  attachmentUrl?: string; // Link ảnh chụp hóa đơn minh chứng

  @IsBoolean()
  @IsOptional()
  isSyncedToInventory: boolean = false; // Checkbox [x] Cập nhật tồn kho

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInboundInvoiceItemDto)
  items!: CreateInboundInvoiceItemDto[]; // Danh sách các mặt hàng chi tiết
}
