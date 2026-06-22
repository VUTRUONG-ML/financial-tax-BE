import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeclarationStatus } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { mapToDto } from '../common/utils/mapper.util';
import { CreateBusinessBankAccountDto } from './dto/create-business-bank-account.dto';
import { UpdateBusinessBankAccountDto } from './dto/update-business-bank-account.dto';
import { BusinessBankAccountResponseDto } from './dto/response-business-bank-account.dto';

@Injectable()
export class BusinessBankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveIsActive(status: DeclarationStatus): boolean {
    return status !== DeclarationStatus.ACCOUNT_CLOSURE;
  }


  private async findOwnedAccount(publicId: string, userId: string) {
    const account = await this.prisma.businessBankAccount.findUnique({
      where: { publicId },
    });

    if (!account) {
      throw new NotFoundException(
        `Business bank account not found: ${publicId}`,
      );
    }

    if (account.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this account.',
      );
    }

    return account;
  }

  // GET /business-bank-accounts
  async findAll(userId: string): Promise<BusinessBankAccountResponseDto[]> {
    const accounts = await this.prisma.businessBankAccount.findMany({
      where: { userId },
      orderBy: { registeredAt: 'desc' },
    });

    return accounts.map((account) =>
      mapToDto(BusinessBankAccountResponseDto, account),
    );
  }

  // POST /business-bank-accounts
  async create(
    userId: string,
    dto: CreateBusinessBankAccountDto,
  ): Promise<BusinessBankAccountResponseDto> {
    const isActive = this.resolveIsActive(dto.declarationStatus);

    const account = await this.prisma.businessBankAccount.create({
      data: {
        userId,
        providerType: dto.providerType,
        providerName: dto.providerName,
        accountNumber: dto.accountNumber,
        accountHolderName: dto.accountHolderName,
        businessLocationName: dto.businessLocationName,
        businessLocationCode: dto.businessLocationCode,
        declarationStatus: dto.declarationStatus,
        isActive,
      },
    });

    return mapToDto(BusinessBankAccountResponseDto, account);
  }

  // PATCH /business-bank-accounts/:publicId
  async update(
    userId: string,
    publicId: string,
    dto: UpdateBusinessBankAccountDto,
  ): Promise<BusinessBankAccountResponseDto> {
    await this.findOwnedAccount(publicId, userId);

    const isActive =
      dto.declarationStatus !== undefined
        ? this.resolveIsActive(dto.declarationStatus)
        : undefined;

    const updated = await this.prisma.businessBankAccount.update({
      where: { publicId },
      data: {
        ...(dto.providerType !== undefined && { providerType: dto.providerType }),
        ...(dto.providerName !== undefined && { providerName: dto.providerName }),
        ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
        ...(dto.accountHolderName !== undefined && { accountHolderName: dto.accountHolderName }),
        ...(dto.businessLocationName !== undefined && { businessLocationName: dto.businessLocationName }),
        ...(dto.businessLocationCode !== undefined && { businessLocationCode: dto.businessLocationCode }),
        ...(dto.declarationStatus !== undefined && { declarationStatus: dto.declarationStatus }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return mapToDto(BusinessBankAccountResponseDto, updated);
  }

  // DELETE /business-bank-accounts/:publicId (soft delete)
  async softDelete(
    userId: string,
    publicId: string,
  ): Promise<BusinessBankAccountResponseDto> {
    await this.findOwnedAccount(publicId, userId);

    const deleted = await this.prisma.businessBankAccount.update({
      where: { publicId },
      data: {
        isActive: false,
        declarationStatus: DeclarationStatus.ACCOUNT_CLOSURE,
      },
    });

    return mapToDto(BusinessBankAccountResponseDto, deleted);
  }
}
