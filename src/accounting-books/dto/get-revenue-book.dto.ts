import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TimeFrame {
  THANG_NAY = 'thang_nay',
  THANG_TRUOC = 'thang_truoc',
  QUY_NAY = 'quy_nay',
  CUSTOM = 'custom',
}

export class GetRevenueBookDto {
  @IsEnum(TimeFrame, {
    message:
      'timeFrame must be one of: thang_nay, thang_truoc, quy_nay, custom',
  })
  @IsNotEmpty()
  timeFrame!: TimeFrame;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  syncCode?: string;
}
