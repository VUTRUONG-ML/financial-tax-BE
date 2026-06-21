import {
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
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
  @IsNotEmpty({ message: 'periodPublicId is required' })
  @IsString()
  periodPublicId!: string;

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
