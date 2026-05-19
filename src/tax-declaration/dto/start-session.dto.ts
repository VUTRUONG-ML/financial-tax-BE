import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class StartSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  periodIdPublicId: string;
}
