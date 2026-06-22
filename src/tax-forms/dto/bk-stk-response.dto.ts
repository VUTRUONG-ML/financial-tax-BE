import { Expose, Type } from 'class-transformer';
import { ProviderType, DeclarationStatus } from '@prisma/client';

export class BkStkAccountItemDto {
  @Expose() providerType!: ProviderType;

  @Expose() providerName!: string;

  @Expose() accountNumber!: string;

  @Expose() accountHolderName!: string;

  @Expose() businessLocationName!: string;

  @Expose() businessLocationCode!: string;

  @Expose() declarationStatus!: DeclarationStatus;
}

export class BkStkResponseDto {
  @Expose() businessName!: string;

  @Expose() taxCode!: string;

  @Expose() ownerName!: string;

  @Expose() address!: string;

  @Expose() phone!: string;

  @Expose()
  @Type(() => BkStkAccountItemDto)
  accounts!: BkStkAccountItemDto[];
}
