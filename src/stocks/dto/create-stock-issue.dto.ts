import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockIssueType, StockIssueDocument } from '@prisma/client';

export class StockIssueItemDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsNumber()
  @Min(0.001)
  @IsNotEmpty()
  quantity!: number;
}

export class CreateStockIssueDto {
  @IsEnum(StockIssueType)
  @IsNotEmpty()
  issueType!: StockIssueType;

  @IsDateString()
  @IsNotEmpty()
  issueDate!: string;

  @IsEnum(StockIssueDocument)
  @IsOptional()
  sourceDocumentType?: StockIssueDocument;

  @IsNumber()
  @IsOptional()
  sourceDocumentId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockIssueItemDto)
  @IsNotEmpty()
  products!: StockIssueItemDto[];
}
