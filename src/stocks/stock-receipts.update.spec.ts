// stock-receipts.update.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { StockReceiptsController } from './stock-receipts.controller';
import { StocksService } from './stocks.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('StockReceiptsController - update endpoint', () => {
  let controller: StockReceiptsController;
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockReceiptsController],
      providers: [
        {
          provide: StocksService,
          useValue: {
            updateStockReceipt: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StockReceiptsController>(StockReceiptsController);
    service = module.get<StocksService>(StocksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('updateStockReceipt', () => {
    it('should update receipt fields successfully', async () => {
      const mockDto = { note: 'Updated note', isPaid: true } as any;
      const mockResult = { receiptCode: 'PNK-001', note: 'Updated note', isPaid: true } as any;
      const mockReq = { financialPeriodId: 1 } as any;
      jest.spyOn(service, 'updateStockReceipt').mockResolvedValue(mockResult);

      const result = await controller.updateStockReceipt('user-123', 'PNK-001', mockDto, mockReq);

      expect(service.updateStockReceipt).toHaveBeenCalledWith('user-123', 'PNK-001', mockDto, 1);
      expect(result).toEqual({
        message: 'Stock receipt updated successfully',
        data: mockResult,
      });
    });
  });
});
