import { Expose, Transform } from 'class-transformer';
import { StockIssueType, StockIssueStatus, StockIssueDocument } from '@prisma/client';

export class StockIssueListItemResponseDto {
  @Expose()
  issueCode!: string;

  @Expose()
  issueDate!: Date;

  @Expose()
  issueType!: StockIssueType;

  @Expose()
  description!: string;

  @Expose()
  @Transform(({ value }) => Number(value))
  totalValue!: number;

  @Expose()
  isAutomatic!: boolean;

  @Expose()
  sourceDocumentType?: StockIssueDocument;

  @Expose()
  sourceDocumentId?: number;

  @Expose()
  sourceDocumentCode?: string;

  @Expose()
  status!: StockIssueStatus;

  @Expose()
  note?: string;
}
