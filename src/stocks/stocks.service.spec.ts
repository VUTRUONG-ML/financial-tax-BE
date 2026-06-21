import { Test, TestingModule } from '@nestjs/testing';
import { StocksService } from './stocks.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { InventoryMovementsService } from '../inventory-movements/inventory-movements.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { StockIssueType } from '@prisma/client';
import { VouchersService } from '../vouchers/vouchers.service';

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
      stockReceipt: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      inboundInvoice: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      stockReceiptInvoice: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      product: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      revenueTracker: {
        update: jest.fn(),
        upsert: jest.fn(),
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
        {
          provide: VouchersService,
          useValue: {
            bulkCancelByStockReceipt: jest.fn(),
          },
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
          userId: mockUserId,
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
          movementType: 'ADJUST_IN',
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
        issueDate: new Date(),
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
      prismaMock.product.findMany.mockResolvedValue([
        { id: 201, sellingPrice: new Decimal(1500) },
      ]);
      prismaMock.revenueTracker.update.mockResolvedValue({});
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
          userId: mockUserId,
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
          movementType: 'ADJUST_IN',
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

  describe('linkInvoice', () => {
    const mockUserId = 'user-1';
    const mockReceiptId = 100;
    const mockReceiptCode = 'PNK-0626-0001';
    const mockInvoicePublicId = 'inv-pub-1';

    it('should link stock receipt to invoice successfully', async () => {
      prismaMock.stockReceipt.findFirst.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        period: { userId: mockUserId },
        details: [],
      });
      prismaMock.inboundInvoice.findUnique.mockResolvedValue({
        id: 200,
        publicId: mockInvoicePublicId,
        userId: mockUserId,
        details: [],
      });
      prismaMock.stockReceiptInvoice.findUnique.mockResolvedValue(null);
      prismaMock.stockReceiptInvoice.create.mockResolvedValue({
        receiptId: mockReceiptId,
        invoiceId: 200,
      });

      const result = await service.linkInvoice(mockUserId, mockReceiptCode, mockInvoicePublicId);

      expect(prismaMock.stockReceipt.findFirst).toHaveBeenCalledWith({
        where: { receiptCode: mockReceiptCode, userId: mockUserId },
        include: { period: true, details: true },
      });
      expect(prismaMock.inboundInvoice.findUnique).toHaveBeenCalledWith({
        where: { publicId: mockInvoicePublicId, userId: mockUserId },
        include: { details: true },
      });
      expect(prismaMock.stockReceiptInvoice.create).toHaveBeenCalledWith({
        data: {
          receiptId: mockReceiptId,
          invoiceId: 200,
        },
      });
      expect(result.message).toContain('Linked stock receipt to invoice successfully');
    });

    it('should throw NotFoundException if stock receipt not found', async () => {
      prismaMock.stockReceipt.findFirst.mockResolvedValue(null);

      await expect(
        service.linkInvoice(mockUserId, mockReceiptCode, mockInvoicePublicId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if link already exists', async () => {
      prismaMock.stockReceipt.findFirst.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        period: { userId: mockUserId },
        details: [],
      });
      prismaMock.inboundInvoice.findUnique.mockResolvedValue({
        id: 200,
        publicId: mockInvoicePublicId,
        userId: mockUserId,
        details: [],
      });
      prismaMock.stockReceiptInvoice.findUnique.mockResolvedValue({
        receiptId: mockReceiptId,
        invoiceId: 200,
      });

      await expect(
        service.linkInvoice(mockUserId, mockReceiptCode, mockInvoicePublicId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unlinkInvoice', () => {
    const mockUserId = 'user-1';
    const mockReceiptId = 100;
    const mockReceiptCode = 'PNK-0626-0001';
    const mockInvoiceId = 200;
    const mockInvoicePublicId = 'inv-pub-1';

    it('should unlink successfully', async () => {
      prismaMock.stockReceipt.findFirst.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        period: { userId: mockUserId },
      });
      prismaMock.inboundInvoice.findUnique.mockResolvedValue({
        id: mockInvoiceId,
        publicId: mockInvoicePublicId,
        userId: mockUserId,
      });
      prismaMock.stockReceiptInvoice.findUnique.mockResolvedValue({
        receiptId: mockReceiptId,
        invoiceId: mockInvoiceId,
      });
      prismaMock.stockReceiptInvoice.delete.mockResolvedValue({});

      const result = await service.unlinkInvoice(mockUserId, mockReceiptCode, mockInvoicePublicId);

      expect(prismaMock.stockReceiptInvoice.delete).toHaveBeenCalled();
      expect(result.message).toContain('Unlinked stock receipt from invoice successfully');
    });

    it('should throw NotFoundException if link does not exist', async () => {
      prismaMock.stockReceipt.findFirst.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        period: { userId: mockUserId },
      });
      prismaMock.inboundInvoice.findUnique.mockResolvedValue({
        id: mockInvoiceId,
        publicId: mockInvoicePublicId,
        userId: mockUserId,
      });
      prismaMock.stockReceiptInvoice.findUnique.mockResolvedValue(null);

      await expect(
        service.unlinkInvoice(mockUserId, mockReceiptCode, mockInvoicePublicId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reconcileReceipt', () => {
    const mockUserId = 'user-1';
    const mockReceiptCode = 'PNK-0626-0001';
    const mockReceiptId = 100;

    it('should throw NotFoundException if receipt does not exist', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue(null);

      await expect(
        service.reconcileReceipt(mockUserId, mockReceiptCode)
      ).rejects.toThrow(NotFoundException);
    });

    it('should return SUCCESS status if no invoice is linked', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(1000),
        details: [],
        period: { userId: mockUserId },
      });
      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue(null);

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('SUCCESS');
      expect(result.validation.warnings).toHaveLength(0);
      expect(result.invoice).toBeNull();
    });

    it('should return SUCCESS status if receipt matches linked invoice perfectly', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(1000),
        details: [
          { productId: 1, quantity: new Decimal(10), unitCost: new Decimal(100) },
        ],
        period: { userId: mockUserId },
      });

      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue({
        invoice: {
          id: 200,
          totalAmount: new Decimal(1000),
          details: [
            { productId: 1, quantity: 10, unitCost: new Decimal(100) },
          ],
        },
      });

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('SUCCESS');
      expect(result.validation.warnings).toHaveLength(0);
    });

    it('should flag TOTAL_AMOUNT_MISMATCH and QUANTITY_MISMATCH', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(900),
        details: [
          { productId: 1, quantity: new Decimal(9), unitCost: new Decimal(100) },
        ],
        period: { userId: mockUserId },
      });

      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue({
        invoice: {
          id: 200,
          totalAmount: new Decimal(1000),
          details: [
            { productId: 1, quantity: 10, unitCost: new Decimal(100) },
          ],
        },
      });

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('WARNING');
      expect(result.validation.warnings).toContainEqual(expect.objectContaining({ code: 'TOTAL_AMOUNT_MISMATCH' }));
      expect(result.validation.warnings).toContainEqual(expect.objectContaining({ code: 'QUANTITY_MISMATCH' }));
    });

    it('should flag PRODUCT_MISSING', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(1000),
        details: [
          { productId: 2, quantity: new Decimal(10), unitCost: new Decimal(100) },
        ],
        period: { userId: mockUserId },
      });

      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue({
        invoice: {
          id: 200,
          totalAmount: new Decimal(1000),
          details: [
            { productId: 1, quantity: 10, unitCost: new Decimal(100) },
          ],
        },
      });

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('WARNING');
      expect(result.validation.warnings).toContainEqual(expect.objectContaining({ code: 'PRODUCT_MISSING' }));
    });

    it('should flag UNIT_COST_MISMATCH as WARNING if diff > 100', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(2500),
        details: [
          { productId: 1, quantity: new Decimal(10), unitCost: new Decimal(250) },
        ],
        period: { userId: mockUserId },
      });

      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue({
        invoice: {
          id: 200,
          totalAmount: new Decimal(1000),
          details: [
            { productId: 1, quantity: 10, unitCost: new Decimal(100) },
          ],
        },
      });

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('WARNING');
      const unitCostWarning = result.validation.warnings.find((w) => w.code === 'UNIT_COST_MISMATCH');
      expect(unitCostWarning.severity).toBe('WARNING');
    });

    it('should flag UNIT_COST_MISMATCH as INFO if diff <= 100', async () => {
      prismaMock.stockReceipt.findUnique.mockResolvedValue({
        id: mockReceiptId,
        receiptCode: mockReceiptCode,
        totalValue: new Decimal(1010),
        details: [
          { productId: 1, quantity: new Decimal(10), unitCost: new Decimal(101) },
        ],
        period: { userId: mockUserId },
      });

      prismaMock.stockReceiptInvoice.findFirst.mockResolvedValue({
        invoice: {
          id: 200,
          totalAmount: new Decimal(1000),
          details: [
            { productId: 1, quantity: 10, unitCost: new Decimal(100) },
          ],
        },
      });

      const result = await service.reconcileReceipt(mockUserId, mockReceiptCode);

      expect(result.validation.status).toBe('WARNING');
      const unitCostWarning = result.validation.warnings.find((w) => w.code === 'UNIT_COST_MISMATCH');
      expect(unitCostWarning.severity).toBe('INFO');
    });
  });
});
