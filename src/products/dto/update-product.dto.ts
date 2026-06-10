import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional } from 'class-validator';

/**
 * UpdateProductDto kế thừa tất cả field từ CreateProductDto
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  file?: any;
}
