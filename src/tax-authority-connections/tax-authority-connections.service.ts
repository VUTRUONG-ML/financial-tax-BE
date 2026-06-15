import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { encrypt } from '../common/utils/crypto.util';
import { AuditLogService, tableWrite } from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_ACTIONS, LOG_STATUS } from '../common/constants/log-events.constant';
import { moment } from '../common/utils/time.util';

@Injectable()
export class TaxAuthorityConnectionsService {
  private readonly logger = new AppLogger(TaxAuthorityConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

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
    const encryptedUsername = encrypt(dto.username);
    const encryptedPassword = encrypt(dto.password);

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
          connectionStatus: 'PENDING_VERIFY',
        },
        create: {
          userId,
          taxCode: dto.taxCode,
          encryptedUsername,
          encryptedPassword,
          cashRegisterCode: dto.cashRegisterCode,
          connectionStatus: 'PENDING_VERIFY',
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        existing ? 'UPDATE' : 'CREATE',
        tableWrite.taxAuthorityConnection as any,
        connection.id,
        existing ? { taxCode: existing.taxCode, status: existing.connectionStatus } : null,
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
}
