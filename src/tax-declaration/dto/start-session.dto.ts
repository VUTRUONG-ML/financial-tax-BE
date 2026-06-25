import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class StartSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  periodIdPublicId: string;

  @ApiProperty({ enum: ['01_TKN_CNKD', '01_CNKD', '02_CNKD_TNCN_QTT'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['01_TKN_CNKD', '01_CNKD', '02_CNKD_TNCN_QTT'])
  declarationFormType: string;
}


