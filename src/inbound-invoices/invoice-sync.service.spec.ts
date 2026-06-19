import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSyncService } from './invoice-sync.service';
import { PrismaService } from '../core/prisma/prisma.service';

describe('InvoiceSyncService', () => {
  let service: InvoiceSyncService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      inboundInvoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSyncService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<InvoiceSyncService>(InvoiceSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncForUser', () => {
    const mockUserId = 'user-123';

    it('should skip syncing if user has no products', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      const result = await service.syncForUser(mockUserId);

      expect(result).toBe(0);
      expect(prismaMock.inboundInvoice.create).not.toHaveBeenCalled();
    });

    it('should skip syncing if user not found', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        { id: 1, sellingPrice: 100, skuCode: 'TEST-SKU-1' },
      ]);
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.syncForUser(mockUserId);

      expect(result).toBe(0);
      expect(prismaMock.inboundInvoice.create).not.toHaveBeenCalled();
    });

    it('should skip syncing if invoices already exist', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        { id: 1, sellingPrice: 100, skuCode: 'TEST-SKU-1' },
      ]);
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        taxCode: 'TEST-TAX-CODE',
      });
      prismaMock.inboundInvoice.findFirst.mockResolvedValue({ id: 1 });

      const result = await service.syncForUser(mockUserId);

      expect(result).toBe(0);
      expect(prismaMock.inboundInvoice.create).not.toHaveBeenCalled();
    });

    it('should sync invoices successfully using existing products', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        { id: 1, sellingPrice: 100, skuCode: 'TEST-SKU-1' },
      ]);
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        taxCode: 'TEST-TAX-CODE',
      });
      prismaMock.inboundInvoice.findFirst.mockResolvedValue(null);
      prismaMock.inboundInvoice.create.mockResolvedValue({ id: 1 });

      const result = await service.syncForUser(mockUserId);

      expect(result).toBe(3);
      expect(prismaMock.inboundInvoice.create).toHaveBeenCalledTimes(3);
    });
  });
});
