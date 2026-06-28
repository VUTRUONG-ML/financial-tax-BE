import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class ConfirmTaxPaymentDto {
  @ApiPropertyOptional({ example: '2026-02-15T00:00:00Z' })
  @IsNotEmpty()
  @IsDateString() // Đảm bảo định dạng ngày tháng gửi lên là hợp lệ
  paymentDate!: string;
}
