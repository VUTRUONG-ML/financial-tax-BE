// stock-issues.update.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { StockIssuesController } from './stock-issues.controller';
import { StocksService } from './stocks.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('StockIssuesController - update endpoint', () => {
  let controller: StockIssuesController;
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockIssuesController],
      providers: [
        {
          provide: StocksService,
          useValue: {
            updateStockIssue: jest.fn(),
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

  describe('updateStockIssue', () => {
    it('should update issue fields successfully', async () => {
      const mockDto = { note: 'Updated issue note' } as any;
      const mockResult = { issueCode: 'PXK-001', note: 'Updated issue note' } as any;
      const mockReq = { financialPeriodId: 1 } as any;
      jest.spyOn(service, 'updateStockIssue').mockResolvedValue(mockResult);

      const result = await controller.updateStockIssue('user-123', 'PXK-001', mockDto, mockReq);

      expect(service.updateStockIssue).toHaveBeenCalledWith('user-123', 'PXK-001', mockDto);
      expect(result).toEqual({
        message: 'Stock issue updated successfully',
        data: mockResult,
      });
    });
  });
});
