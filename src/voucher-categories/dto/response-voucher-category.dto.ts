import { Expose, Transform } from 'class-transformer';
import { VoucherType, S2cExpenseMapping } from '@prisma/client';

export class VoucherCategoryResponseDto {
  @Expose()
  id!: number; // Giữ ID để Frontend làm Value cho Dropdown/Select

  @Expose()
  categoryName!: string;

  @Expose()
  type!: VoucherType;

  @Expose()
  s2cExpenseMapping!: S2cExpenseMapping;

  @Expose()
  @Transform(({ obj }) => obj.userId === null || obj.userId === undefined) // Trả về true nếu userId là null (hạng mục hệ thống)
  isSystemDefault!: boolean;
}
