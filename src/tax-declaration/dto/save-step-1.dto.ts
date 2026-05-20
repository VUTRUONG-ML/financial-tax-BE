import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SaveStep1Dto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  businessName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provinceCity?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cccdNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ownerName?: string;
}
