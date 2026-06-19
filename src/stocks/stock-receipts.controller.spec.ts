import { Test, TestingModule } from '@nestjs/testing';
import { StockReceiptsController } from './stock-receipts.controller';
import { StocksService } from './stocks.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { HttpStatus } from '@nestjs/common';

describe('StockReceiptsController', () => {
  let controller: StockReceiptsController;
  let service: StocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockReceiptsController],
      providers: [
        {
          provide: StocksService,
          useValue: {
            findAllReceipts: jest.fn(),
            createStockReceipt: jest.fn(),
            cancelReceipt: jest.fn(),
            linkInvoice: jest.fn(),
            unlinkInvoice: jest.fn(),
            getLinkedInvoices: jest.fn(),
            reconcileReceipt: jest.fn(),
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

  describe('createStockReceipt', () => {
    it('should create stock receipt successfully', async () => {
      const mockDto = { products: [] } as any;
      const mockResult = { id: 1 };
      jest.spyOn(service, 'createStockReceipt').mockResolvedValue(mockResult);

      const result = await controller.createStockReceipt('user-123', mockDto, { financialPeriodId: 10 } as any);

      expect(service.createStockReceipt).toHaveBeenCalledWith('user-123', mockDto, 10);
      expect(result).toEqual({
        message: 'Stock receipt created successfully',
        data: mockResult,
      });
    });
  });

  describe('cancelStockReceipt', () => {
    it('should cancel stock receipt successfully', async () => {
      const mockResult = { id: 1 };
      jest.spyOn(service, 'cancelReceipt').mockResolvedValue(mockResult);

      const result = await controller.cancelStockReceipt('user-123', 'PNK-001', { financialPeriodId: 10 } as any);

      expect(service.cancelReceipt).toHaveBeenCalledWith('user-123', 10, 'PNK-001');
      expect(result).toEqual({
        message: 'Stock receipt canceled successfully',
        data: mockResult,
      });
    });
  });

  describe('linkInvoice', () => {
    it('should link invoice successfully', async () => {
      const mockResult = { message: 'Linked successfully' };
      jest.spyOn(service, 'linkInvoice').mockResolvedValue(mockResult);

      const result = await controller.linkInvoice('user-123', 'PNK-001', 'inv-public-id');

      expect(service.linkInvoice).toHaveBeenCalledWith('user-123', 'PNK-001', 'inv-public-id');
      expect(result).toEqual(mockResult);
    });
  });

  describe('unlinkInvoice', () => {
    it('should unlink invoice successfully', async () => {
      const mockResult = { message: 'Unlinked successfully' };
      jest.spyOn(service, 'unlinkInvoice').mockResolvedValue(mockResult);

      const result = await controller.unlinkInvoice('user-123', 'PNK-001', 'inv-public-id');

      expect(service.unlinkInvoice).toHaveBeenCalledWith('user-123', 'PNK-001', 'inv-public-id');
      expect(result).toEqual(mockResult);
    });
  });

  describe('getLinkedInvoices', () => {
    it('should return linked invoices successfully', async () => {
      const mockResult = [{ id: 2, publicId: 'inv-public-id' }];
      jest.spyOn(service, 'getLinkedInvoices').mockResolvedValue(mockResult);

      const result = await controller.getLinkedInvoices('user-123', 'PNK-001');

      expect(service.getLinkedInvoices).toHaveBeenCalledWith('user-123', 'PNK-001');
      expect(result).toEqual({
        message: 'Linked invoices retrieved successfully',
        data: mockResult,
      });
    });
  });

  describe('getReceiptDetail', () => {
    it('should return receipt details with validation successfully', async () => {
      const mockResult = { receipt: { id: 1 }, invoice: null, validation: { status: 'SUCCESS', warnings: [] } };
      jest.spyOn(service, 'reconcileReceipt').mockResolvedValue(mockResult);

      const result = await controller.getReceiptDetail('user-123', 'PNK-001');

      expect(service.reconcileReceipt).toHaveBeenCalledWith('user-123', 'PNK-001');
      expect(result).toEqual(mockResult);
    });
  });
});
