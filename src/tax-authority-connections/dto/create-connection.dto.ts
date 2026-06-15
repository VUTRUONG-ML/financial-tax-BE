import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 13, { message: 'taxCode must be between 10 and 13 characters' })
  taxCode!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Length(5, 5, { message: 'cashRegisterCode must be exactly 5 characters' })
  cashRegisterCode!: string;
}
