import { Test, TestingModule } from '@nestjs/testing';
import { CostEngineService } from './cost-engine.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import { InventoryMovementType, StockIssueStatus } from '@prisma/client';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { StocksService } from '../stocks/stocks.service';

describe('CostEngineService', () => {
  let service: CostEngineService;
  let prismaMock: any;
  let financialPeriodsServiceMock: any;
  let stocksServiceMock: any;
  let txMock: any;

  beforeEach(async () => {
    prismaMock = {};
    financialPeriodsServiceMock = {
      ensurePeriodExists: jest.fn(),
    };
    stocksServiceMock = {
      createStockReceipt: jest.fn(),
    };

    txMock = {
      financialPeriod: {
        findUnique: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      stockIssueDetail: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockReceiptDetail: {
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      stockReceipt: {
        findFirst: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      stockIssue: {
        findFirst: jest.fn(),
      },
      internalProductionOrder: {
        findMany: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostEngineService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: FinancialPeriodsService,
          useValue: financialPeriodsServiceMock,
        },
        {
          provide: StocksService,
          useValue: stocksServiceMock,
        },
      ],
    }).compile();

    service = module.get<CostEngineService>(CostEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateAndApplyWeightedAverageCosts', () => {
    const mockUserId = 'user-1';
    const mockPeriodId = 10;

    it('should throw an error if financial period is not found', async () => {
      txMock.financialPeriod.findUnique.mockResolvedValue(null);

      await expect(
        service.calculateAndApplyWeightedAverageCosts(mockUserId, mockPeriodId, txMock),
      ).rejects.toThrow(`Financial period with id ${mockPeriodId} not found.`);
    });

    it('should compute weighted average cost correctly with two-phase production dependencies', async () => {
      // Setup Period
      txMock.financialPeriod.findUnique.mockResolvedValue({
        id: mockPeriodId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T23:59:59.999Z'),
      });

      // Mock Next Period from financialPeriodsService
      const mockNextPeriod = {
        id: mockPeriodId + 1,
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        endDate: new Date('2026-02-28T23:59:59.999Z'),
      };
      financialPeriodsServiceMock.ensurePeriodExists.mockResolvedValue(mockNextPeriod);

      // 1. Mock active products in the period (inventoryMovements with product { userId })
      txMock.inventoryMovement.findMany.mockImplementation(async (args: any) => {
        const { where } = args;

        // Listing active products in period
        if (where.periodId === mockPeriodId && where.product && !where.movementType) {
          return [
            { productId: 1 }, // Raw material
            { productId: 2 }, // Produced finished good
          ];
        }

        // Opening movements query for specific products
        if (where.movementType === InventoryMovementType.OPENING && where.periodId === mockPeriodId) {
          if (where.productId === 1) {
            return [
              {
                id: 1,
                productId: 1,
                quantity: 10,
                totalValue: new Decimal('100.00'),
                movementType: InventoryMovementType.OPENING,
              },
            ];
          }
          if (where.productId === 2) {
            return []; // Product 2 has no opening balance
          }
        }

        // Outbound movements query for specific products
        if (where.movementType?.in && where.periodId === mockPeriodId) {
          if (where.productId === 1) {
            return [
              { id: 1001, quantity: 15, movementType: InventoryMovementType.PRODUCTION_OUT },
            ];
          }
          if (where.productId === 2) {
            return [
              { id: 1002, quantity: 1, movementType: InventoryMovementType.SALE_OUT },
            ];
          }
        }

        return [];
      });

      // 2. Mock stockReceiptDetail.findMany
      txMock.stockReceiptDetail.findMany.mockImplementation(async (args: any) => {
        const { where } = args;

        // Identify produced products
        if (where.receipt?.sourceType === 'PRODUCTION' && where.product?.userId === mockUserId) {
          return [
            { productId: 2 },
          ];
        }

        // Query for old next-period opening receipt details
        if (where.receipt?.sourceType === 'OPENING') {
          return [];
        }

        // Inbound details for calculateProductCost
        if (where.productId === 1) {
          // Phase 1 (Purchase / Adjustment)
          return [
            { quantity: new Decimal(20), totalValue: new Decimal('300.00') },
          ];
        }

        if (where.productId === 2) {
          // Phase 2 (Production / Purchase / Adjustment)
          // We mock this to return the updated detail that has the allocated cost = 200
          return [
            { quantity: new Decimal(2), totalValue: new Decimal('200.00') },
          ];
        }

        return [];
      });

      // 3. Mock stockIssueDetail.findMany
      txMock.stockIssueDetail.findMany.mockImplementation(async (args: any) => {
        const { where } = args;
        if (where.productId === 1) {
          return [
            { id: 501, quantity: new Decimal('15') },
          ];
        }
        if (where.productId === 2) {
          return [
            { id: 502, quantity: new Decimal('1') },
          ];
        }
        return [];
      });

      // 4. Mock production orders query
      txMock.internalProductionOrder.findMany.mockResolvedValue([
        { id: 100, orderCode: 'LSX-01', status: 'ACTIVE' },
      ]);

      // 5. Mock stockIssue and stockReceipt search for intermediate production costing
      txMock.stockIssue.findFirst.mockResolvedValue({
        id: 200,
        details: [
          { id: 501, productId: 1, quantity: new Decimal('15'), finalCogsValue: new Decimal('200.00') },
        ],
      });

      txMock.stockReceipt.findFirst.mockResolvedValue({
        id: 300,
        details: [
          { id: 601, productId: 2, quantity: new Decimal('2'), totalValue: new Decimal('0.00') },
        ],
      });

      // Mock product query for carry-forward DTO creation
      txMock.product.findUnique.mockImplementation(async (args: any) => {
        const { where } = args;
        if (where.id === 1) return { publicId: 'prod-pub-1' };
        if (where.id === 2) return { publicId: 'prod-pub-2' };
        return null;
      });

      // Execute calculation
      await service.calculateAndApplyWeightedAverageCosts(mockUserId, mockPeriodId, txMock);

      // Verify Phase 1 Calculations for Product 1 (Raw material):
      // Opening: 10 qty, 100 val
      // Inbound: 20 qty, 300 val
      // Total: 30 qty, 400 val => Unit cost = 13.333333...
      const expectedCost1 = new Decimal(400).div(30);
      const expectedCogsVal1 = new Decimal(15).mul(expectedCost1);

      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          finalWeightedUnitCost: expectedCost1,
          finalCogsValue: expectedCogsVal1,
        },
      });

      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 1001 },
        data: {
          unitCost: expectedCost1,
          totalValue: expectedCogsVal1,
        },
      });

      // Ending stock carry forward check:
      // Product 1: total = 30, outbound = 15 => ending = 15.
      expect(stocksServiceMock.createStockReceipt).toHaveBeenCalledWith(
        mockUserId,
        {
          sourceType: 'OPENING',
          receiptDate: mockNextPeriod.startDate.toISOString(),
          products: [
            {
              productPublicId: 'prod-pub-1',
              quantity: 15,
              unitCost: Number(expectedCost1),
            },
          ],
        },
        mockNextPeriod.id,
        txMock,
      );

      // Verify Intermediate Costing updates:
      // totalMaterialCost of order-1 = 200.
      // Total produced quantity = 2.
      // Allocated cost to Product 2 = 200. Unit cost = 100.
      expect(txMock.stockReceiptDetail.update).toHaveBeenCalledWith({
        where: { id: 601 },
        data: {
          unitCost: new Decimal(100),
          totalValue: new Decimal(200),
        },
      });

      expect(txMock.inventoryMovement.updateMany).toHaveBeenCalledWith({
        where: {
          sourceDocumentId: 300,
          sourceDocumentType: 'PRODUCTION_ORDER',
          productId: 2,
          movementType: 'PRODUCTION_IN',
        },
        data: {
          unitCost: new Decimal(100),
          totalValue: new Decimal(200),
        },
      });

      expect(txMock.stockReceipt.update).toHaveBeenCalledWith({
        where: { id: 300 },
        data: {
          totalValue: new Decimal(200),
        },
      });

      // Verify Phase 2 Calculations for Product 2 (Finished Good):
      // Opening: 0 qty, 0 val
      // Inbound (Production): 2 qty, 200 val => Unit cost = 100.
      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 502 },
        data: {
          finalWeightedUnitCost: new Decimal(100),
          finalCogsValue: new Decimal(100),
        },
      });

      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 1002 },
        data: {
          unitCost: new Decimal(100),
          totalValue: new Decimal(100),
        },
      });

      // Ending stock carry forward check:
      // Product 2: total = 2, outbound = 1 => ending = 1.
      expect(stocksServiceMock.createStockReceipt).toHaveBeenCalledWith(
        mockUserId,
        {
          sourceType: 'OPENING',
          receiptDate: mockNextPeriod.startDate.toISOString(),
          products: [
            {
              productPublicId: 'prod-pub-2',
              quantity: 1,
              unitCost: 100,
            },
          ],
        },
        mockNextPeriod.id,
        txMock,
      );
    });
  });
});
