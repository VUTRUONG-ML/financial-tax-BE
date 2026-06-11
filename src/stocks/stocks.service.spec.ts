import { Test, TestingModule } from '@nestjs/testing';
import { StocksService } from './stocks.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { InventoryMovementsService } from '../inventory-movements/inventory-movements.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { StockIssueType } from '@prisma/client';

describe('StocksService', () => {
  let service: StocksService;
  let prismaMock: any;
  let auditLogMock: any;
  let movementsMock: any;

  beforeEach(async () => {
    prismaMock = {
      stockIssue: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      product: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };

    auditLogMock = {
      logChange: jest.fn(),
    };

    movementsMock = {
      createInventoryMovement: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StocksService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AuditLogService,
          useValue: auditLogMock,
        },
        {
          provide: InventoryMovementsService,
          useValue: movementsMock,
        },
      ],
    }).compile();

    service = module.get<StocksService>(StocksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cancelIssue', () => {
    const mockUserId = 'user-1';
    const mockPeriodId = 10;
    const mockIssueCode = 'PXK-0626-0001';

    it('should throw NotFoundException if stock issue is not found', async () => {
      prismaMock.stockIssue.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelIssue(mockUserId, mockPeriodId, mockIssueCode),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if stock issue type is SALE and isSystemAction is false', async () => {
      prismaMock.stockIssue.findFirst.mockResolvedValue({
        id: 1,
        issueCode: mockIssueCode,
        issueType: StockIssueType.SALE,
        details: [],
      });

      await expect(
        service.cancelIssue(mockUserId, mockPeriodId, mockIssueCode, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if stock issue has source INVOICE and isSystemAction is false', async () => {
      prismaMock.stockIssue.findFirst.mockResolvedValue({
        id: 1,
        issueCode: mockIssueCode,
        issueType: StockIssueType.PRODUCTION,
        sourceDocumentType: 'INVOICE',
        details: [],
      });

      await expect(
        service.cancelIssue(mockUserId, mockPeriodId, mockIssueCode, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if updateMany returns 0 count (already canceled)', async () => {
      prismaMock.stockIssue.findFirst.mockResolvedValue({
        id: 1,
        issueCode: mockIssueCode,
        issueType: StockIssueType.PRODUCTION,
        details: [],
      });
      prismaMock.stockIssue.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelIssue(mockUserId, mockPeriodId, mockIssueCode),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cancel stock issue, increment product stock, and create adjustment movement successfully', async () => {
      const mockIssue = {
        id: 1,
        issueCode: mockIssueCode,
        issueType: StockIssueType.PRODUCTION,
        sourceDocumentType: 'PRODUCTION_ORDER',
        sourceDocumentId: 100,
        status: 'APPROVED',
        details: [
          {
            id: 101,
            productId: 201,
            quantity: new Decimal(5),
            provisionalUnitCost: new Decimal(1000),
          },
        ],
      };

      prismaMock.stockIssue.findFirst.mockResolvedValue(mockIssue);
      prismaMock.stockIssue.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
      movementsMock.createInventoryMovement.mockResolvedValue({});
      auditLogMock.logChange.mockResolvedValue({});

      const finalMockIssue = {
        ...mockIssue,
        status: 'CANCELLED',
        period: { periodName: 'June 2026' },
        details: [
          {
            id: 101,
            productId: 201,
            quantity: new Decimal(5),
            provisionalUnitCost: new Decimal(1000),
            product: {
              publicId: 'prod-abc',
              productName: 'Mock Product',
              skuCode: 'SKU123',
            },
          },
        ],
      };
      prismaMock.stockIssue.findUnique.mockResolvedValue(finalMockIssue);

      const result = await service.cancelIssue(
        mockUserId,
        mockPeriodId,
        mockIssueCode,
      );

      expect(prismaMock.stockIssue.findFirst).toHaveBeenCalled();
      expect(prismaMock.stockIssue.updateMany).toHaveBeenCalledWith({
        where: {
          issueCode: mockIssueCode,
          periodId: mockPeriodId,
          status: { not: 'CANCELLED' },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: 201,
          userId: mockUserId,
        },
        data: {
          currentStock: { increment: 5 },
        },
      });

      expect(movementsMock.createInventoryMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 201,
          periodId: mockPeriodId,
          movementType: 'ADJUSTMENT_INCREASE',
          quantity: 5,
          unitCost: new Decimal(1000),
          sourceDocumentType: 'PRODUCTION_ORDER',
          sourceDocumentId: 1,
        }),
        expect.any(Object),
      );

      expect(auditLogMock.logChange).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.status).toBe('CANCELLED');
    });

    it('should allow cancellation if stock issue has source INVOICE and type SALE when isSystemAction is true', async () => {
      const mockIssue = {
        id: 2,
        issueCode: mockIssueCode,
        issueType: StockIssueType.SALE,
        sourceDocumentType: 'INVOICE',
        sourceDocumentId: 100,
        status: 'APPROVED',
        details: [
          {
            id: 101,
            productId: 201,
            quantity: new Decimal(5),
            provisionalUnitCost: new Decimal(1000),
          },
        ],
      };

      prismaMock.stockIssue.findFirst.mockResolvedValue(mockIssue);
      prismaMock.stockIssue.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
      movementsMock.createInventoryMovement.mockResolvedValue({});
      auditLogMock.logChange.mockResolvedValue({});

      const finalMockIssue = {
        ...mockIssue,
        status: 'CANCELLED',
        period: { periodName: 'June 2026' },
        details: [
          {
            id: 101,
            productId: 201,
            quantity: new Decimal(5),
            provisionalUnitCost: new Decimal(1000),
            product: {
              publicId: 'prod-abc',
              productName: 'Mock Product',
              skuCode: 'SKU123',
            },
          },
        ],
      };
      prismaMock.stockIssue.findUnique.mockResolvedValue(finalMockIssue);

      const result = await service.cancelIssue(
        mockUserId,
        mockPeriodId,
        mockIssueCode,
        true,
      );

      expect(prismaMock.stockIssue.updateMany).toHaveBeenCalledWith({
        where: {
          issueCode: mockIssueCode,
          periodId: mockPeriodId,
          status: { not: 'CANCELLED' },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: 201,
          userId: mockUserId,
        },
        data: {
          currentStock: { increment: 5 },
        },
      });

      expect(movementsMock.createInventoryMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 201,
          periodId: mockPeriodId,
          movementType: 'ADJUSTMENT_INCREASE',
          quantity: 5,
          unitCost: new Decimal(1000),
          sourceDocumentType: 'OUTBOUND_INVOICE',
          sourceDocumentId: 2,
        }),
        expect.any(Object),
      );

      expect(auditLogMock.logChange).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.status).toBe('CANCELLED');
    });
  });
});
