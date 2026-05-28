import { Test, TestingModule } from '@nestjs/testing';
import { InboundInvoicesService } from './inbound-invoices.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { ProductsService } from '../products/products.service';

describe('InboundInvoicesService', () => {
  let service: InboundInvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundInvoicesService,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            inboundInvoice: {
              create: jest.fn(),
              findUnique: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn((cb) =>
              cb({
                inboundInvoice: {
                  create: jest.fn(),
                  findUnique: jest.fn(),
                },
                product: {
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
        {
          provide: VouchersService,
          useValue: {},
        },
        {
          provide: ProductsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<InboundInvoicesService>(InboundInvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
