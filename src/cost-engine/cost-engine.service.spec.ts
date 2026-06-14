import { Test, TestingModule } from '@nestjs/testing';
import { CostEngineService } from './cost-engine.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import { InventoryMovementType, StockIssueStatus } from '@prisma/client';

describe('CostEngineService', () => {
  let service: CostEngineService;
  let prismaMock: any;
  let txMock: any;

  beforeEach(async () => {
    prismaMock = {};

    txMock = {
      financialPeriod: {
        findUnique: jest.fn(),
      },
      openingInventoryBalance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockIssueDetail: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostEngineService,
        {
          provide: PrismaService,
          useValue: prismaMock,
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
    const mockPeriodYear = 2026;

    it('should throw an error if financial period is not found', async () => {
      txMock.financialPeriod.findUnique.mockResolvedValue(null);

      await expect(
        service.calculateAndApplyWeightedAverageCosts(mockUserId, mockPeriodId, txMock),
      ).rejects.toThrow(`Financial period with id ${mockPeriodId} not found.`);
    });

    it('should compute weighted average cost correctly and update records', async () => {
      // Setup Period
      txMock.financialPeriod.findUnique.mockResolvedValue({
        id: mockPeriodId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
      });

      // Products lists:
      // Product 1: Has both opening and movements
      // Product 2: Has only opening
      // Product 3: Has only movements
      // Product 4: Has opening qty = 0, no movements
      txMock.openingInventoryBalance.findMany.mockResolvedValue([
        { productId: 1 },
        { productId: 2 },
        { productId: 4 },
      ]);

      txMock.inventoryMovement.findMany.mockImplementation(async (args: any) => {
        const { where } = args;
        // If query is for general movements of the period to find product IDs
        if (where.periodId === mockPeriodId && !where.productId) {
          return [
            { productId: 1 },
            { productId: 3 },
          ];
        }
        // Query for inbound movements of a specific product
        if (where.productId === 1 && where.movementType?.in?.includes(InventoryMovementType.PURCHASE_IN)) {
          return [
            {
              productId: 1,
              quantity: 20,
              totalValue: new Decimal('300.00'),
              movementType: InventoryMovementType.PURCHASE_IN,
            },
            {
              productId: 1,
              quantity: 10,
              totalValue: new Decimal('100.00'),
              movementType: InventoryMovementType.PRODUCTION_IN,
            },
            {
              productId: 1,
              quantity: 5,
              totalValue: new Decimal('50.00'),
              movementType: InventoryMovementType.ADJUSTMENT_INCREASE,
            },
          ];
        }
        if (where.productId === 2 && where.movementType?.in?.includes(InventoryMovementType.PURCHASE_IN)) {
          return []; // Product 2 has no inbound movements
        }
        if (where.productId === 3 && where.movementType?.in?.includes(InventoryMovementType.PURCHASE_IN)) {
          return [
            {
              productId: 3,
              quantity: 20,
              totalValue: new Decimal('300.00'),
              movementType: InventoryMovementType.PURCHASE_IN,
            },
          ];
        }
        if (where.productId === 4 && where.movementType?.in?.includes(InventoryMovementType.PURCHASE_IN)) {
          return [];
        }

        // Query for outbound movements of a specific product to update
        if (where.productId === 1 && where.movementType?.in?.includes(InventoryMovementType.SALE_OUT)) {
          return [
            { id: 101, productId: 1, quantity: 15, movementType: InventoryMovementType.SALE_OUT },
            { id: 102, productId: 1, quantity: 5, movementType: InventoryMovementType.PRODUCTION_OUT },
          ];
        }
        if (where.productId === 2 && where.movementType?.in?.includes(InventoryMovementType.SALE_OUT)) {
          return [
            { id: 201, productId: 2, quantity: 5, movementType: InventoryMovementType.SALE_OUT },
          ];
        }
        if (where.productId === 3 && where.movementType?.in?.includes(InventoryMovementType.SALE_OUT)) {
          return [];
        }
        if (where.productId === 4 && where.movementType?.in?.includes(InventoryMovementType.SALE_OUT)) {
          return [];
        }

        return [];
      });

      // Mock unique opening balance queries
      txMock.openingInventoryBalance.findUnique.mockImplementation(async (args: any) => {
        const { where } = args;
        const { productId, periodYear } = where.productId_periodYear;

        if (productId === 1 && periodYear === mockPeriodYear) {
          return {
            productId: 1,
            periodYear: mockPeriodYear,
            openingQuantity: 10,
            openingValue: new Decimal('100.00'),
          };
        }
        if (productId === 2 && periodYear === mockPeriodYear) {
          return {
            productId: 2,
            periodYear: mockPeriodYear,
            openingQuantity: 10,
            openingValue: new Decimal('100.00'),
          };
        }
        if (productId === 4 && periodYear === mockPeriodYear) {
          return {
            productId: 4,
            periodYear: mockPeriodYear,
            openingQuantity: 0,
            openingValue: new Decimal('0.00'),
          };
        }

        return null; // Product 3 has no opening balance
      });

      // Mock stock issue details
      txMock.stockIssueDetail.findMany.mockImplementation(async (args: any) => {
        const { where } = args;
        if (where.productId === 1) {
          return [
            { id: 501, productId: 1, quantity: new Decimal('15') },
          ];
        }
        if (where.productId === 2) {
          return [
            { id: 502, productId: 2, quantity: new Decimal('5') },
          ];
        }
        return [];
      });

      // Execute calculation
      await service.calculateAndApplyWeightedAverageCosts(mockUserId, mockPeriodId, txMock);

      // Verify Product 1 Math:
      // Opening: Qty = 10, Val = 100
      // Inbound: Qty = 35, Val = 450
      // Total: Qty = 45, Val = 550
      // Unit Cost = 550 / 45 = 12.222222...
      // Expected Cost = new Decimal(550).div(45)
      const expectedCost1 = new Decimal(550).div(45);

      // Check updating StockIssueDetails for Product 1
      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          finalWeightedUnitCost: expectedCost1,
          finalCogsValue: new Decimal('15').mul(expectedCost1),
        },
      });

      // Check updating InventoryMovements for Product 1
      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          unitCost: expectedCost1,
          totalValue: new Decimal('15').mul(expectedCost1),
        },
      });
      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 102 },
        data: {
          unitCost: expectedCost1,
          totalValue: new Decimal('5').mul(expectedCost1),
        },
      });

      // Verify Product 2 Math:
      // Opening: Qty = 10, Val = 100
      // Inbound: Qty = 0, Val = 0
      // Total: Qty = 10, Val = 100
      // Unit Cost = 100 / 10 = 10
      const expectedCost2 = new Decimal(10);
      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 502 },
        data: {
          finalWeightedUnitCost: expectedCost2,
          finalCogsValue: new Decimal('5').mul(expectedCost2),
        },
      });
      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 201 },
        data: {
          unitCost: expectedCost2,
          totalValue: new Decimal('5').mul(expectedCost2),
        },
      });

      // Verify Product 3 Math:
      // Opening: Qty = 0, Val = 0
      // Inbound: Qty = 20, Val = 300
      // Total: Qty = 20, Val = 300
      // Unit Cost = 15
      // Product 3 has no stock issue details or outbound movements to update in mock setup, but should still calculate.

      // Verify Product 4 Math:
      // Opening: Qty = 0, Val = 0
      // Inbound: Qty = 0, Val = 0
      // Total: Qty = 0, Val = 0
      // Unit Cost = 0
    });
  });
});
