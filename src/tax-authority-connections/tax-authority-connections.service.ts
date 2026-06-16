import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { encrypt } from '../common/utils/crypto.util';
import { AuditLogService, tableWrite } from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_STATUS } from '../common/constants/log-events.constant';
import { moment } from '../common/utils/time.util';
import { TaxAuthorityConnectionStatus } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TaxAuthorityConnectionsService {
  private readonly logger = new AppLogger(TaxAuthorityConnectionsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
  ) { }

  private async verifyTaxAuthorityAccount(dto: CreateConnectionDto) {
    const baseUrl = this.configService.get<string>('MOCK_TAX_AUTHORITY_URL');

    const response = await firstValueFrom(
      this.httpService.post(`${baseUrl}/mock-tax-authority/verify`, {
        taxCode: dto.taxCode,
        username: dto.username,
        password: dto.password,
        cashRegisterCode: dto.cashRegisterCode
      }),
    );

    return response.data;
  }

  async getConnection(userId: string) {
    const connection = await this.prisma.taxAuthorityConnection.findUnique({
      where: { userId },
    });

    return {
      isConfigured: !!connection,
      taxCode: connection?.taxCode ?? null,
      cashRegisterCode: connection?.cashRegisterCode ?? null,
      connectionStatus: connection?.connectionStatus ?? null,
      lastVerifiedAt: connection?.lastVerifiedAt
        ? moment(connection.lastVerifiedAt).format('YYYY-MM-DD')
        : null,
    };
  }

  async upsertConnection(userId: string, dto: CreateConnectionDto) {
    try {
      await this.verifyTaxAuthorityAccount(dto);
    } catch (error) {
      throw new BadRequestException({
        message: error.response?.data ?? 'Tax authority verification failed.',
        errorCode: 'INVALID_CREDENTIAL',
      });
    }

    // 2. Encrypt credentials
    const encryptedUsername = encrypt(dto.username);
    const encryptedPassword = encrypt(dto.password);

    // 3. Upsert to DB with VERIFIED status
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.taxAuthorityConnection.findUnique({
        where: { userId },
      });

      const connection = await tx.taxAuthorityConnection.upsert({
        where: { userId },
        update: {
          taxCode: dto.taxCode,
          encryptedUsername,
          encryptedPassword,
          cashRegisterCode: dto.cashRegisterCode,
          connectionStatus: 'VERIFIED',
          lastVerifiedAt: new Date(),
        },
        create: {
          userId,
          taxCode: dto.taxCode,
          encryptedUsername,
          encryptedPassword,
          cashRegisterCode: dto.cashRegisterCode,
          connectionStatus: 'VERIFIED',
          lastVerifiedAt: new Date(),
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        existing ? 'UPDATE' : 'CREATE',
        tableWrite.taxAuthorityConnection,
        connection.id,
        existing
          ? {
            taxCode: existing.taxCode,
            status: existing.connectionStatus,
          }
          : null,
        { taxCode: connection.taxCode, status: connection.connectionStatus },
      );

      this.logger.log(`Tax authority connection upserted successfully.`, {
        status: LOG_STATUS.SUCCESS,
        userId,
      });

      return {
        isConfigured: true,
        taxCode: connection.taxCode,
        cashRegisterCode: connection.cashRegisterCode,
        connectionStatus: connection.connectionStatus,
        lastVerifiedAt: connection.lastVerifiedAt
          ? moment(connection.lastVerifiedAt).format('YYYY-MM-DD')
          : null,
      };
    });
  }

  async verifyConnection(userId: string) {
    const connection = await this.prisma.taxAuthorityConnection.findUnique({
      where: { userId },
    });
    if (!connection) {
      this.logger.warn('ENSURE_TAX_CONNECTION', {
        status: LOG_STATUS.FAILED,
        reason: 'NOT_CONFIGURED',
        userId,
      });
      throw new NotFoundException({
        message: 'Tax connection not found.',
        errorCode: 'NOT_CONFIGURED',
      });
    }
    if (connection.connectionStatus !== TaxAuthorityConnectionStatus.VERIFIED) {
      this.logger.warn('ENSURE_TAX_CONNECTION', {
        status: LOG_STATUS.FAILED,
        reason: 'NOT_VERIFIED',
        userId,
      });
      throw new BadRequestException({
        message: 'Tax connection not verified',
        errorCode: 'NOT_VERIFIED',
      });
    }
    return {
      cashRegisterCode: connection.cashRegisterCode,
      connectionStatus: connection.connectionStatus,
      verifiedAt: connection.lastVerifiedAt,
    };
  }
}
