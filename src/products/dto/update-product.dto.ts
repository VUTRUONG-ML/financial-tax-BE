import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * UpdateProductDto kế thừa tất cả field từ CreateProductDto (đều optional).
 * currentStock KHÔNG có trong CreateProductDto nên KHÔNG thể truyền vào đây —
 * cột này chỉ được cập nhật nội bộ qua DB Transaction khi có hóa đơn.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
