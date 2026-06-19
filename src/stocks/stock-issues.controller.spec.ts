import { Test, TestingModule } from '@nestjs/testing';
import { StockIssuesController } from './stock-issues.controller';
import { StocksService } from './stocks.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('StockIssuesController', () => {
  let controller: StockIssuesController;
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockIssuesController],
      providers: [
        {
          provide: StocksService,
          useValue: {
            findAllIssues: jest.fn(),
            createStockIssue: jest.fn(),
            cancelIssue: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StockIssuesController>(StockIssuesController);
    service = module.get<StocksService>(StocksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllIssues', () => {
    it('should return all stock issues', async () => {
      const mockResult = { data: [], meta: { total: 0, page: 1, lastPage: 0 } };
      jest.spyOn(service, 'findAllIssues').mockResolvedValue(mockResult);

      const result = await controller.findAllIssues('user-123', '1', '20', 'SALE');

      expect(service.findAllIssues).toHaveBeenCalledWith('user-123', 1, 20, 'SALE');
      expect(result).toEqual({
        message: 'Stock issues retrieved successfully',
        ...mockResult,
      });
    });
  });

  describe('createStockIssue', () => {
    it('should create stock issue successfully', async () => {
      const mockDto = { products: [] } as any;
      const mockResult = { id: 1 };
      jest.spyOn(service, 'createStockIssue').mockResolvedValue(mockResult);

      const result = await controller.createStockIssue('user-123', mockDto, { financialPeriodId: 10 } as any);

      expect(service.createStockIssue).toHaveBeenCalledWith('user-123', mockDto, 10);
      expect(result).toEqual({
        message: 'Stock issue created successfully',
        data: mockResult,
      });
    });
  });

  describe('cancelStockIssue', () => {
    it('should cancel stock issue successfully', async () => {
      const mockResult = { id: 1 };
      jest.spyOn(service, 'cancelIssue').mockResolvedValue(mockResult);

      const result = await controller.cancelStockIssue('user-123', 'PXK-001', { financialPeriodId: 10 } as any);

      expect(service.cancelIssue).toHaveBeenCalledWith('user-123', 10, 'PXK-001');
      expect(result).toEqual({
        message: 'Stock issue canceled successfully',
        data: mockResult,
      });
    });
  });
});
