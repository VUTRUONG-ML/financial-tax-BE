import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../../common/logger/app-logger.service';

type ActionWrite = 'CREATE' | 'UPDATE' | 'DELETE';
@Injectable()
export class AuditLogService {
  /**
   * Hàm ghi log dùng chung cho toàn hệ thống.
   * BẮT BUỘC nhận vào tx (TransactionClient) để chạy chung một luồng ACID.
   */
  private readonly logger = new AppLogger(AuditLogService.name);

  async logChange(
    tx: Prisma.TransactionClient,
    userId: string,
    action: ActionWrite,
    tableName: string,
    recordId: string | number,
    oldValues: unknown = null,
    newValues: unknown = null,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId: String(recordId),
        // Ép kiểu về JSON của Prisma để tránh lỗi lưu object undefined
        oldValues: oldValues
          ? (oldValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        newValues: newValues
          ? (newValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    this.logger.log('Audit log success.', { userId, action, tableName });
  }
}
