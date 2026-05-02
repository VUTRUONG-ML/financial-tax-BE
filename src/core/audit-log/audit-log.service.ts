import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../../common/logger/app-logger.service';

type ActionWrite =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STOCK_REVERT_BY_INVOICE_CANCEL';
export enum tableWrite {
  tax_configurations = 'tax_configurations',
  users = 'users',
  invoices = 'invoices',
  vouchers = 'vouchers',
  inboundInvoice = 'inbound_invoices',
  products = 'products',
  internal_production_orders = 'internal_production_orders',
}
@Injectable()
export class AuditLogService {
  /**
   * Hàm ghi log dùng chung cho toàn hệ thống.
   * BẮT BUỘC nhận vào tx (TransactionClient) để chạy chung một luồng ACID.
   */
  private readonly logger = new AppLogger(AuditLogService.name);

  async logChange(
    tx: Prisma.TransactionClient,
    userId: string = 'SYSTEM_AUTO',
    action: ActionWrite,
    tableName: tableWrite,
    recordId: string | number,
    oldValues: unknown = null,
    newValues: unknown = null,
    note?: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId,
        action,
        tableName: String(tableName),
        recordId: String(recordId),
        // Ép kiểu về JSON của Prisma để tránh lỗi lưu object undefined
        oldValues: oldValues
          ? (oldValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        newValues: newValues
          ? (newValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        note,
      },
    });
    this.logger.log('Audit log success.', { userId, action, tableName });
  }
}
