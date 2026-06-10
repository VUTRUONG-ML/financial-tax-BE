import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { ProductionStatus } from '@prisma/client';

describe('InternalProductionOrdersController', () => {
  let controller: InternalProductionOrdersController;
  let service: InternalProductionOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalProductionOrdersController],
      providers: [
        {
          provide: InternalProductionOrdersService,
          useValue: {
            create: jest.fn(),
            cancel: jest.fn(),
            findOne: jest.fn(),
            getSummary: jest.fn(),
            update: jest.fn(),
            findAll: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InternalProductionOrdersController>(
      InternalProductionOrdersController,
    );
    service = module.get<InternalProductionOrdersService>(
      InternalProductionOrdersService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should call getSummary on service and return result', async () => {
      const mockResult = {
        totalOrders: 10,
        completedOrders: 8,
        canceledOrders: 2,
      };
      jest.spyOn(service, 'getSummary').mockResolvedValue(mockResult);

      const result = await controller.getSummary('user-1');

      expect(service.getSummary).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        message: 'Production orders summary retrieved successfully',
        data: mockResult,
      });
    });
  });

  describe('findOne', () => {
    it('should call findOne on service and return details', async () => {
      const mockResult = {
        orderCode: 'LSX-0526-0001',
        notes: 'test notes',
        status: ProductionStatus.ACTIVE,
        transactionAt: new Date(),
        details: [],
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(mockResult as any);

      const result = await controller.findOne('user-1', 'LSX-0526-0001');

      expect(service.findOne).toHaveBeenCalledWith('user-1', 'LSX-0526-0001');
      expect(result).toEqual({
        message: 'Internal production order details retrieved successfully',
        data: mockResult,
      });
    });
  });

  describe('update', () => {
    it('should call update on service and return updated order', async () => {
      const mockDto = { notes: 'updated notes' };
      const mockResult = {
        orderCode: 'LSX-0526-0001',
        notes: 'updated notes',
        status: ProductionStatus.ACTIVE,
        transactionAt: new Date(),
        details: [],
      };
      jest.spyOn(service, 'update').mockResolvedValue(mockResult as any);

      const result = await controller.update(
        'user-1',
        'LSX-0526-0001',
        mockDto,
      );

      expect(service.update).toHaveBeenCalledWith(
        'user-1',
        'LSX-0526-0001',
        mockDto,
      );
      expect(result).toEqual({
        message: 'Internal production order updated successfully',
        data: mockResult,
      });
    });
  });

  describe('findAll', () => {
    it('should call findAll on service and return list', async () => {
      const mockQuery = { page: 1, limit: 10, status: 'ACTIVE' };
      const mockResult = {
        data: [],
        meta: { total: 0, page: 1, lastPage: 1 },
      };
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult as any);

      const result = await controller.findAll('user-1', mockQuery);

      expect(service.findAll).toHaveBeenCalledWith('user-1', mockQuery);
      expect(result).toEqual({
        message: 'Internal production orders retrieved successfully',
        ...mockResult,
      });
    });
  });
});
