import { PartialType } from '@nestjs/swagger';
import { CreateVoucherCategoryDto } from './create-voucher-category.dto';

export class UpdateVoucherCategoryDto extends PartialType(
  CreateVoucherCategoryDto,
) {}
