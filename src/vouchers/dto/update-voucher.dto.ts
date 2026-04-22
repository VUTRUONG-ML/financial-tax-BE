import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVoucherDto } from './create-voucher.dto';

export class UpdateVoucherDto extends PartialType(
  OmitType(CreateVoucherDto, ['voucherType'] as const),
) {}
