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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxpayerOption?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxPeriodOption?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  declarationTypeOption?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  authorizedFilerName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  authorizedFilerTaxCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  authorizedFilerDocNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  authorizedFilerDocDate?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxAgentName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxAgentTaxCode?: string;
}
