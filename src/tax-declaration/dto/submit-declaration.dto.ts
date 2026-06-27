import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { PitMethod } from '@prisma/client';

export class SubmitDeclarationDto {
  @ApiProperty({ enum: PitMethod })
  @IsEnum(PitMethod)
  chosenPitMethod: PitMethod;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  xmlContent: string;
}
