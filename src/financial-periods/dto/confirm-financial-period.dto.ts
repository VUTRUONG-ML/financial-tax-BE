import { IsDateString, IsNotEmpty } from 'class-validator';

export class ConfirmTaxPaymentDto {
  @IsNotEmpty()
  @IsDateString() // Đảm bảo định dạng ngày tháng gửi lên là hợp lệ
  paymentDate!: Date;
}
