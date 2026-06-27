import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyMockTaxAccountDto {
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
}
