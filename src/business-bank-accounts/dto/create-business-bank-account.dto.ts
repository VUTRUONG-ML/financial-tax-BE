import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ProviderType, DeclarationStatus } from '@prisma/client';

export class CreateBusinessBankAccountDto {
  @IsEnum(ProviderType)
  @IsNotEmpty()
  providerType!: ProviderType;

  @IsString()
  @IsNotEmpty()
  providerName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  businessLocationName!: string;

  @IsString()
  @IsNotEmpty()
  businessLocationCode!: string;

  @IsEnum(DeclarationStatus)
  @IsNotEmpty()
  declarationStatus!: DeclarationStatus;
}
