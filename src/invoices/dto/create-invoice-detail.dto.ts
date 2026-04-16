import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateInvoiceDetailDto {
  /**
   * Dùng publicId (cuid) thay vì id số để tránh lộ serial key.
   * Service sẽ dùng publicId này để tra cứu product, lấy giá & tên snapshot.
   */
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
