import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PitMethod } from '@prisma/client';

export class SubmitDeclarationDto {
  @ApiProperty({ enum: PitMethod })
  @IsEnum(PitMethod)
  chosenPitMethod: PitMethod;
}
