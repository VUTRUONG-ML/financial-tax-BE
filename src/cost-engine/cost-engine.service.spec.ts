import { Test, TestingModule } from '@nestjs/testing';
import { CostEngineService } from './cost-engine.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/client';
import { InventoryMovementType, StockIssueStatus } from '@prisma/client';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';

describe('CostEngineService', () => {
  let service: CostEngineService;
  let prismaMock: any;
  let financialPeriodsServiceMock: any;
  let txMock: any;

  beforeEach(async () => {
    prismaMock = {};
    financialPeriodsServiceMock = {
      ensurePeriodExists: jest.fn(),
    };

    txMock = {
      financialPeriod: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
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
        {
          provide: FinancialPeriodsService,
          useValue: financialPeriodsServiceMock,
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

    it('should compute weighted average cost correctly and update records', async () => {
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

      txMock.inventoryMovement.findMany.mockImplementation(async (args: any) => {
        const { where } = args;

        // 1. Initial product list searches
        if (where.productId === undefined) {
          // Find products with opening balances
          if (where.periodId === mockPeriodId && where.movementType === InventoryMovementType.OPENING) {
            return [
              { productId: 1 },
              { productId: 2 },
              { productId: 4 },
            ];
          }
          // Find products with movements in general
          if (where.periodId === mockPeriodId && !where.movementType) {
            return [
              { productId: 1 },
              { productId: 3 },
            ];
          }
          return [];
        }

        // 2. Loop product searches
        const productId = where.productId;
        // Inbound / Opening query for specific product
        if (where.movementType === InventoryMovementType.OPENING) {
          if (productId === 1) {
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
          if (productId === 2) {
            return [
              {
                id: 2,
                productId: 2,
                quantity: 10,
                totalValue: new Decimal('100.00'),
                movementType: InventoryMovementType.OPENING,
              },
            ];
          }
          if (productId === 4) {
            return [
              {
                id: 4,
                productId: 4,
                quantity: 0,
                totalValue: new Decimal('0.00'),
                movementType: InventoryMovementType.OPENING,
              },
            ];
          }
          return []; // Product 3 has no opening
        }

        // Inbound movements (Purchase, Production, Adjust)
        if (where.movementType?.in?.includes(InventoryMovementType.PURCHASE_IN)) {
          if (productId === 1) {
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
                movementType: InventoryMovementType.ADJUST_IN,
              },
            ];
          }
          if (productId === 3) {
            return [
              {
                productId: 3,
                quantity: 20,
                totalValue: new Decimal('300.00'),
                movementType: InventoryMovementType.PURCHASE_IN,
              },
            ];
          }
          return [];
        }

        // Outbound movements (Sale, Production, Adjust)
        if (where.movementType?.in?.includes(InventoryMovementType.SALE_OUT)) {
          if (productId === 1) {
            return [
              { id: 101, productId: 1, quantity: 15, movementType: InventoryMovementType.SALE_OUT },
              { id: 102, productId: 1, quantity: 5, movementType: InventoryMovementType.PRODUCTION_OUT },
            ];
          }
          if (productId === 2) {
            return [
              { id: 201, productId: 2, quantity: 5, movementType: InventoryMovementType.SALE_OUT },
            ];
          }
          return [];
        }

        return [];
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

      // Verify Product 1 calculations:
      // Opening: Qty = 10, Val = 100
      // Inbound: Qty = 35, Val = 450
      // Total: Qty = 45, Val = 550
      // Unit Cost = 550 / 45 = 12.222222...
      // Expected Cost = new Decimal(550).div(45)
      const expectedCost1 = new Decimal(550).div(45);
      const expectedOutboundVal1_15 = new Decimal('15').mul(expectedCost1);
      const expectedOutboundVal1_5 = new Decimal('5').mul(expectedCost1);

      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          finalWeightedUnitCost: expectedCost1,
          finalCogsValue: expectedOutboundVal1_15,
        },
      });

      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          unitCost: expectedCost1,
          totalValue: expectedOutboundVal1_15,
        },
      });
      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 102 },
        data: {
          unitCost: expectedCost1,
          totalValue: expectedOutboundVal1_5,
        },
      });

      // Ending stock Product 1:
      // Total Qty = 45, Outbound Qty = 20 => Ending Qty = 25.
      // Ending Val = 25 * expectedCost1
      expect(txMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 1,
          periodId: mockNextPeriod.id,
          movementType: InventoryMovementType.OPENING,
          quantity: 25,
          unitCost: expectedCost1,
          totalValue: new Decimal(25).mul(expectedCost1),
          movementDate: mockNextPeriod.startDate,
        },
      });

      // Verify Product 2 calculations:
      // Opening: Qty = 10, Val = 100
      // Inbound: Qty = 0, Val = 0
      // Total: Qty = 10, Val = 100
      // Unit Cost = 10
      const expectedCost2 = new Decimal(10);
      const expectedOutboundVal2_5 = new Decimal('5').mul(expectedCost2);

      expect(txMock.stockIssueDetail.update).toHaveBeenCalledWith({
        where: { id: 502 },
        data: {
          finalWeightedUnitCost: expectedCost2,
          finalCogsValue: expectedOutboundVal2_5,
        },
      });
      expect(txMock.inventoryMovement.update).toHaveBeenCalledWith({
        where: { id: 201 },
        data: {
          unitCost: expectedCost2,
          totalValue: expectedOutboundVal2_5,
        },
      });

      // Ending stock Product 2:
      // Total Qty = 10, Outbound Qty = 5 => Ending Qty = 5.
      // Ending Val = 50.
      expect(txMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 2,
          periodId: mockNextPeriod.id,
          movementType: InventoryMovementType.OPENING,
          quantity: 5,
          unitCost: expectedCost2,
          totalValue: new Decimal(50),
          movementDate: mockNextPeriod.startDate,
        },
      });

      // Verify Product 3 calculations:
      // Opening: Qty = 0, Val = 0
      // Inbound: Qty = 20, Val = 300
      // Total: Qty = 20, Val = 300
      // Unit Cost = 15
      // Ending stock Product 3:
      // Total Qty = 20, Outbound Qty = 0 => Ending Qty = 20.
      // Ending Val = 300.
      expect(txMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 3,
          periodId: mockNextPeriod.id,
          movementType: InventoryMovementType.OPENING,
          quantity: 20,
          unitCost: new Decimal(15),
          totalValue: new Decimal(300),
          movementDate: mockNextPeriod.startDate,
        },
      });
    });
  });
});
