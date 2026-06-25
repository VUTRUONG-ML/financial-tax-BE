import { Test, TestingModule } from '@nestjs/testing';
import { CostEngineService } from './cost-engine.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import { InventoryMovementType } from '@prisma/client';
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
      getReceiptAggregatesByProduct: jest.fn().mockImplementation(
        async (periodId, sourceTypes, productIds) => {
          const map = new Map<number, { qty: number; val: Decimal }>();
          if (productIds.includes(1)) {
            map.set(1, { qty: 20, val: new Decimal('300.00') });
          }
          if (productIds.includes(2)) {
            map.set(2, { qty: 2, val: new Decimal('200.00') });
          }
          return map;
        }
      ),
      getIssueAggregatesByProduct: jest.fn().mockImplementation(
        async (periodId, productIds) => {
          const map = new Map<number, number>();
          if (productIds.includes(1)) {
            map.set(1, 15);
          }
          if (productIds.includes(2)) {
            map.set(2, 1);
          }
          return map;
        }
      ),
    };

    txMock = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
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
        deleteMany: jest.fn(),
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
        findMany: jest.fn(),
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

      // Mock active movements to find active products
      txMock.inventoryMovement.findMany.mockImplementation(async (args: any) => {
        const { where } = args;

        // Listing active products in period
        if (where.periodId === mockPeriodId && where.product && !where.movementType) {
          return [
            { productId: 1 }, // Raw material
            { productId: 2 }, // Produced finished good
          ];
        }
        return [];
      });

      // Mock stockReceiptDetail.findMany to classify produced products and fetch next period opening details
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

        return [];
      });

      // Mock raw SELECT queries
      txMock.$queryRawUnsafe.mockImplementation(async (query: string, ...params: any[]) => {
        if (query.includes('FROM inventory_movements') && query.includes("movement_type = 'OPENING'")) {
          // Opening aggregates
          if (query.includes('1') && query.includes('2')) {
            // Both products queried
            return [
              { productId: 1, quantity: 10, totalValue: new Decimal('100.00') }
            ];
          }
          if (query.includes('1')) {
            return [
              { productId: 1, quantity: 10, totalValue: new Decimal('100.00') }
            ];
          }
          return [];
        }

        if (query.includes('FROM stock_receipt_details d')) {
          // Receipt aggregates
          if (query.includes('1') && query.includes('2')) {
            // Phase 2 or combined check
            return [
              { productId: 1, quantity: new Decimal(20), totalValue: new Decimal('300.00') },
              { productId: 2, quantity: new Decimal(2), totalValue: new Decimal('200.00') }
            ];
          }
          if (query.includes('1')) {
            // Phase 1 (Product 1 only)
            return [
              { productId: 1, quantity: new Decimal(20), totalValue: new Decimal('300.00') }
            ];
          }
          if (query.includes('2')) {
            // Product 2 only
            return [
              { productId: 2, quantity: new Decimal(2), totalValue: new Decimal('200.00') }
            ];
          }
        }

        if (query.includes('FROM stock_issue_details') && query.includes("issue_type IN ('SALE'")) {
          // Outbound aggregates
          if (query.includes('1') && query.includes('2')) {
            return [
              { productId: 1, quantity: 15 },
              { productId: 2, quantity: 1 }
            ];
          }
          if (query.includes('1')) {
            return [
              { productId: 1, quantity: 15 }
            ];
          }
          if (query.includes('2')) {
            return [
              { productId: 2, quantity: 1 }
            ];
          }
        }

        if (query.includes('FROM stock_issue_details') && query.includes('source_document_type')) {
          return [
            { totalMaterialCost: new Decimal('200.00') }
          ];
        }

        return [];
      });

      txMock.$executeRawUnsafe.mockResolvedValue(1);

      // Mock production orders query
      txMock.internalProductionOrder.findMany.mockResolvedValue([
        { id: 100, orderCode: 'LSX-01', status: 'ACTIVE' },
      ]);

      // Mock stockIssue and stockReceipt search for intermediate production costing
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
      txMock.product.findMany.mockResolvedValue([
        { id: 1, publicId: 'prod-pub-1' },
        { id: 2, publicId: 'prod-pub-2' },
      ]);

      // Execute calculation
      await service.calculateAndApplyWeightedAverageCosts(mockUserId, mockPeriodId, txMock);

      // Verify Phase 1 Calculations for Product 1 (Raw material):
      // Opening: 10 qty, 100 val
      // Inbound: 20 qty, 300 val
      // Total: 30 qty, 400 val => Unit cost = 13.333333...
      const expectedCost1 = new Decimal(400).div(30);

      // Verify that executeRawUnsafe was called to update the records in bulk
      expect(txMock.$executeRawUnsafe).toHaveBeenCalled();
      const executeRawCalls = txMock.$executeRawUnsafe.mock.calls;
      expect(executeRawCalls.length).toBeGreaterThanOrEqual(4);

      // Verify that Product 1 updates got executed with expected cost
      const phase1IssuesUpdate = executeRawCalls.find(
        (call: any) => call[0].includes('UPDATE stock_issue_details') && call[0].includes('13.3333333333')
      );
      expect(phase1IssuesUpdate).toBeDefined();

      const phase1MovementsUpdate = executeRawCalls.find(
        (call: any) => call[0].includes('UPDATE inventory_movements') && call[0].includes('13.3333333333')
      );
      expect(phase1MovementsUpdate).toBeDefined();

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

      // Verify Phase 2 updates got executed with expected cost (100)
      const phase2IssuesUpdate = executeRawCalls.find(
        (call: any) => call[0].includes('UPDATE stock_issue_details') && call[0].includes('100::numeric')
      );
      expect(phase2IssuesUpdate).toBeDefined();

      const phase2MovementsUpdate = executeRawCalls.find(
        (call: any) => call[0].includes('UPDATE inventory_movements') && call[0].includes('100::numeric')
      );
      expect(phase2MovementsUpdate).toBeDefined();

      // Ending stock carry forward check:
      // Product 1: total = 30, outbound = 15 => ending = 15.
      // Product 2: total = 2, outbound = 1 => ending = 1.
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
