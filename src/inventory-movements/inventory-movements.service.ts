import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  Prisma,
  InventoryMovementType,
  SourceDocumentType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class InventoryMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async createInventoryMovement(
    data: {
      productId: number;
      periodId: number;
      movementType: InventoryMovementType;
      quantity: number;
      unitCost: Decimal;
      totalValue: Decimal;
      movementDate: Date;
      sourceDocumentType?: SourceDocumentType;
      sourceDocumentId?: number;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.inventoryMovement.create({
      data: {
        productId: data.productId,
        periodId: data.periodId,
        movementType: data.movementType,
        quantity: data.quantity,
        unitCost: data.unitCost,
        totalValue: data.totalValue,
        movementDate: data.movementDate,
        sourceDocumentType: data.sourceDocumentType,
        sourceDocumentId: data.sourceDocumentId,
      },
    });
  }
}
