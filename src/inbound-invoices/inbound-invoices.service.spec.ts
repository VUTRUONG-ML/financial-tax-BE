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
              count: jest.fn(),
              aggregate: jest.fn(),
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

  describe('getSummary', () => {
    it('should return inbound invoices summary', async () => {
      const mockUserId = 'user-1';
      const mockCount = 5;
      const mockAggregateActive = {
        _sum: {
          totalAmount: 1000000,
        },
      };
      const mockAggregateUnpaid = {
        _sum: {
          totalAmount: 400000,
          paidAmount: 150000,
        },
      };

      jest
        .spyOn(service['prisma'].inboundInvoice, 'count')
        .mockResolvedValue(mockCount);
      jest
        .spyOn(service['prisma'].inboundInvoice, 'aggregate')
        .mockResolvedValueOnce(mockAggregateActive as any)
        .mockResolvedValueOnce(mockAggregateUnpaid as any);

      const result = await service.getSummary(mockUserId);

      expect(service['prisma'].inboundInvoice.count).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(
        service['prisma'].inboundInvoice.aggregate,
      ).toHaveBeenNthCalledWith(1, {
        where: { userId: mockUserId, status: 'ACTIVE' },
        _sum: { totalAmount: true },
      });
      expect(
        service['prisma'].inboundInvoice.aggregate,
      ).toHaveBeenNthCalledWith(2, {
        where: { userId: mockUserId, status: 'ACTIVE', isPaid: false },
        _sum: { totalAmount: true, paidAmount: true },
      });

      expect(result).toEqual({
        tong_so_luong_hoa_don: 5,
        tong_doanh_thu: 1000000,
        tong_chua_thanh_toan: 250000,
      });
    });
  });
});
