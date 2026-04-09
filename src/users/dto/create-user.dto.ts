import {
  IsString,
  IsNotEmpty,
  IsPhoneNumber,
  Length,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('VN', { message: 'Phone invalid' })
  phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 50, {
    message: 'Passwords must be between 6 and 50 characters long.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{10,13}$/, {
    message: 'The tax identification number must be 10-13 digits.',
  })
  taxCode!: string;

  @IsString()
  @IsNotEmpty()
  businessName!: string;

  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(12, 12, {
    message: 'The citizen identification card must have exactly 12 digits.',
  })
  cccdNumber!: string;

  @IsString()
  @IsNotEmpty()
  provinceCity!: string;
}
