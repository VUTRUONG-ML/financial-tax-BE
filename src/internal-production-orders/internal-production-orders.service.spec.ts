import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductionStatus } from '@prisma/client';

describe('InternalProductionOrdersService', () => {
  let service: InternalProductionOrdersService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalProductionOrdersService,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            internalProductionOrder: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
              findMany: jest.fn(),
              groupBy: jest.fn(),
            },
            productionDetail: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $transaction: jest.fn((cb) =>
              cb({
                $executeRaw: jest.fn(),
                internalProductionOrder: {
                  findFirst: jest.fn(),
                  findUnique: jest.fn(),
                  create: jest.fn(),
                  update: jest.fn(),
                  updateMany: jest.fn(),
                },
                product: {
                  findMany: jest.fn(),
                  findUnique: jest.fn(),
                  update: jest.fn(),
                  updateMany: jest.fn(),
                },
                productionDetail: {
                  deleteMany: jest.fn(),
                  createMany: jest.fn(),
                },
                auditLog: {
                  createMany: jest.fn(),
                },
              }),
            ),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logChange: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InternalProductionOrdersService>(InternalProductionOrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      jest.spyOn(prisma.internalProductionOrder, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne('user-1', 'LSX-0001')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return mapped order if it exists', async () => {
      const mockOrder = {
        id: 1,
        userId: 'user-1',
        orderCode: 'LSX-0001',
        notes: 'test',
        status: ProductionStatus.ACTIVE,
        transactionAt: new Date(),
        details: [],
      };
      jest.spyOn(prisma.internalProductionOrder, 'findUnique').mockResolvedValue(mockOrder as any);

      const result = await service.findOne('user-1', 'LSX-0001');
      expect(result.orderCode).toBe('LSX-0001');
    });
  });

  describe('cancel', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      const mockTx = {
        internalProductionOrder: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await expect(service.cancel('user-1', 'LSX-0001')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order is already canceled', async () => {
      const mockTx = {
        internalProductionOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            userId: 'user-1',
            orderCode: 'LSX-0001',
            status: ProductionStatus.CANCELED,
            details: [],
          }),
        },
      };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      await expect(service.cancel('user-1', 'LSX-0001')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getSummary', () => {
    it('should compute status summary counts', async () => {
      jest
        .spyOn(prisma.internalProductionOrder, 'count')
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);

      const result = await service.getSummary('user-1');
      expect(result).toEqual({
        totalOrders: 7,
        completedOrders: 5,
        canceledOrders: 2,
      });
    });
  });

  describe('findAll', () => {
    it('should query without status if not provided', async () => {
      jest.spyOn(prisma.internalProductionOrder, 'count').mockResolvedValue(10);
      jest.spyOn(prisma.internalProductionOrder, 'findMany').mockResolvedValue([]);

      const result = await service.findAll('user-1', { page: 1, limit: 10 });
      expect(result.meta.total).toBe(10);
      expect(prisma.internalProductionOrder.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should filter by ACTIVE if status is ACTIVE', async () => {
      jest.spyOn(prisma.internalProductionOrder, 'count').mockResolvedValue(5);
      jest.spyOn(prisma.internalProductionOrder, 'findMany').mockResolvedValue([]);

      await service.findAll('user-1', { status: 'ACTIVE' });
      expect(prisma.internalProductionOrder.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'ACTIVE' },
      });
    });
  });
});
