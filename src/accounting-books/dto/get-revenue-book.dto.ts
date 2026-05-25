import { IsEnum, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum TimeFrame {
  THANG_NAY = 'thang_nay',
  THANG_TRUOC = 'thang_truoc',
  QUY_NAY = 'quy_nay',
  NAM_NAY = 'nam_nay',
  NAM_TRUOC = 'nam_truoc',
  SEVEN_NGAY_QUA = '7_ngay_qua',
  THIRTY_NGAY_QUA = '30_ngay_qua',
  TUAN_NAY = 'tuan_nay',
  TUAN_TRUOC = 'tuan_truoc',
  CUSTOM = 'custom',
}

export class GetRevenueBookDto {
  @IsEnum(TimeFrame, {
    message:
      'timeFrame must be one of: thang_nay, thang_truoc, quy_nay, nam_nay, nam_truoc, 7_ngay_qua, 30_ngay_qua, tuan_nay, tuan_truoc, custom',
  })
  @IsNotEmpty()
  timeFrame!: TimeFrame;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

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
