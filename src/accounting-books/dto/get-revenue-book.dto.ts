import {
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TimeFrame {
  NAM_NAY = 'nam_nay',
  NUA_DAU_NAM = 'nua_dau_nam',
  NUA_CUOI_NAM = 'nua_cuoi_nam',
}

export class GetRevenueBookDto {
  @IsNotEmpty({ message: 'periodPublicId is required' })
  @IsString()
  periodPublicId!: string;

  @IsOptional()
  @IsEnum(TimeFrame)
  timeFrame?: TimeFrame;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  taxCategoryId?: number;

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
