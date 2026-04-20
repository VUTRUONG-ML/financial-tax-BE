import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsDecimal,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNumber,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInboundInvoiceItemDto {
  @IsNotEmpty()
  @IsNumber()
  productId!: number; // ID sản phẩm đã có trong danh mục

  @IsNotEmpty()
  @IsNumber()
  quantity!: number; // Số lượng nhập vật lý

  @IsNotEmpty()
  @IsNumber()
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

  @IsNotEmpty()
  @IsNumber()
  totalAmount!: number; // Tổng số tiền trên hóa đơn

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
