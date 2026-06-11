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
});
