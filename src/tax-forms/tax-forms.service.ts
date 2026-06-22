import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { UsersService } from '../users/users.service';
import { BusinessBankAccountsService } from '../business-bank-accounts/business-bank-accounts.service';
import { BkStkAccountItemDto, BkStkResponseDto } from './dto/bk-stk-response.dto';

@Injectable()
export class TaxFormsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly businessBankAccountsService: BusinessBankAccountsService,
  ) {}

  async getBkStk(userId: string): Promise<BkStkResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const allAccounts =
      await this.businessBankAccountsService.findAll(userId);

    const activeAccounts = allAccounts.filter((a) => a.isActive);

    const accounts = activeAccounts.map((a) =>
      plainToInstance(BkStkAccountItemDto, a, {
        excludeExtraneousValues: true,
      }),
    );

    return plainToInstance(
      BkStkResponseDto,
      {
        businessName: user.businessName,
        taxCode: user.taxCode,
        ownerName: user.ownerName,
        address: '', // Để trống theo spec hiện tại
        phone: user.phoneNumber,
        accounts,
      },
      { excludeExtraneousValues: true },
    );
  }
}
