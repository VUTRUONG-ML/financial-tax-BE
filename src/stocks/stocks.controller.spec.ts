import { Test, TestingModule } from '@nestjs/testing';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('StocksController', () => {
  let controller: StocksController;
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StocksController],
      providers: [
        {
          provide: StocksService,
          useValue: {
            createStockReceipt: jest.fn(),
            createStockIssue: jest.fn(),
            cancelIssue: jest.fn(),
            getSummary: jest.fn(),
            findAllReceipts: jest.fn(),
            findAllIssues: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StocksController>(StocksController);
    service = module.get<StocksService>(StocksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('cancelStockIssue', () => {
    it('should cancel stock issue successfully', async () => {
      const mockResult = { id: 1, issueCode: 'PXK-0626-0001' } as any;
      jest.spyOn(service, 'cancelIssue').mockResolvedValue(mockResult);

      const result = await controller.cancelStockIssue(
        'user-123',
        'PXK-0626-0001',
        { financialPeriodId: 10 } as any,
      );

      expect(service.cancelIssue).toHaveBeenCalledWith(
        'user-123',
        10,
        'PXK-0626-0001',
      );
      expect(result).toEqual({
        message: 'Stock issue canceled successfully',
        data: mockResult,
      });
    });
  });

  describe('getSummary', () => {
    it('should return stock summary', async () => {
      const mockSummary = { endingInventoryValue: 1000 } as any;
      jest.spyOn(service, 'getSummary').mockResolvedValue(mockSummary);

      const result = await controller.getSummary('user-123');

      expect(service.getSummary).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        message: 'Stock summary retrieved successfully',
        data: mockSummary,
      });
    });
  });

  describe('findAllReceipts', () => {
    it('should return all stock receipts', async () => {
      const mockResult = { data: [], meta: { total: 0, page: 1, lastPage: 0 } };
      jest.spyOn(service, 'findAllReceipts').mockResolvedValue(mockResult);

      const result = await controller.findAllReceipts('user-123', '1', '20', 'PURCHASE');

      expect(service.findAllReceipts).toHaveBeenCalledWith('user-123', 1, 20, 'PURCHASE');
      expect(result).toEqual({
        message: 'Stock receipts retrieved successfully',
        ...mockResult,
      });
    });
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
});
