import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type ActionWrite = 'CREATE' | 'UPDATE' | 'DELETE';
@Injectable()
export class AuditLogService {
  /**
   * Hàm ghi log dùng chung cho toàn hệ thống.
   * BẮT BUỘC nhận vào tx (TransactionClient) để chạy chung một luồng ACID.
   */
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
  }
}
