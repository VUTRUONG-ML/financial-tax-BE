import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
