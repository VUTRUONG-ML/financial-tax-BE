import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { StockIssueType } from '@prisma/client';

/**
 * DTO cập nhật phiếu xuất kho.
 * - Không được cập nhật danh sách sản phẩm, số lượng hay tổng tiền.
 * - Có thể cập nhật: issueDate, issueType, note.
 */
export class UpdateStockIssueDto {
  @IsEnum(StockIssueType)
  @IsOptional()
  issueType?: StockIssueType;

  @IsString()
  @IsOptional()
  note?: string;
}
