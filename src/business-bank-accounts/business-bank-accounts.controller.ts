import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BusinessBankAccountsService } from './business-bank-accounts.service';
import { CreateBusinessBankAccountDto } from './dto/create-business-bank-account.dto';
import { UpdateBusinessBankAccountDto } from './dto/update-business-bank-account.dto';

@Controller('business-bank-accounts')
@UseGuards(JwtAuthGuard)
export class BusinessBankAccountsController {
  constructor(
    private readonly businessBankAccountsService: BusinessBankAccountsService,
  ) {}

  // GET /business-bank-accounts
  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    const data = await this.businessBankAccountsService.findAll(userId);
    return { message: 'Business bank accounts retrieved successfully.', data };
  }

  // POST /business-bank-accounts
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBusinessBankAccountDto,
  ) {
    const data = await this.businessBankAccountsService.create(userId, dto);
    return { message: 'Business bank account created successfully.', data };
  }

  // PATCH /business-bank-accounts/:publicId
  @Patch(':publicId')
  async update(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
    @Body() dto: UpdateBusinessBankAccountDto,
  ) {
    const data = await this.businessBankAccountsService.update(
      userId,
      publicId,
      dto,
    );
    return { message: 'Business bank account updated successfully.', data };
  }

  // DELETE /business-bank-accounts/:publicId (soft delete)
  @Delete(':publicId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const data = await this.businessBankAccountsService.softDelete(
      userId,
      publicId,
    );
    return { message: 'Business bank account closed successfully.', data };
  }
}
