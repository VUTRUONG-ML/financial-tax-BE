import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';

describe('InternalProductionOrdersService', () => {
  let service: InternalProductionOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalProductionOrdersService,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            internalProductionOrder: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $transaction: jest.fn((cb) =>
              cb({
                $executeRaw: jest.fn(),
                internalProductionOrder: {
                  findFirst: jest.fn(),
                  create: jest.fn(),
                },
                product: {
                  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                  update: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
