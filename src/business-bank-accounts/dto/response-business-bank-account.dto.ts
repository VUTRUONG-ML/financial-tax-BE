import { Expose } from 'class-transformer';
import { DeclarationStatus, ProviderType } from '@prisma/client';

export class BusinessBankAccountResponseDto {
  // Không lộ id, userId — chỉ dùng publicId làm định danh public
  @Expose() publicId!: string;

  @Expose() providerType!: ProviderType;

  @Expose() providerName!: string;

  @Expose() accountNumber!: string;

  @Expose() accountHolderName!: string;

  @Expose() businessLocationName!: string;

  @Expose() businessLocationCode!: string;

  @Expose() declarationStatus!: DeclarationStatus;

  @Expose() isActive!: boolean;

  @Expose() registeredAt!: Date;

  @Expose() updatedAt!: Date;
}
