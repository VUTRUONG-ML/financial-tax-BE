import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksController } from './accounting-books.controller';
import { AccountingBooksService } from './accounting-books.service';
import { TimeFrame } from './dto/get-revenue-book.dto';

describe('AccountingBooksController', () => {
  let controller: AccountingBooksController;
  let service: jest.Mocked<AccountingBooksService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingBooksController],
      providers: [
        {
          provide: AccountingBooksService,
          useValue: {
            getRevenueBookSummary: jest.fn(),
            getRevenueBookRecords: jest.fn(),
            getCashFlowBookSummary: jest.fn(),
            getCashFlowBookRecords: jest.fn(),
            getExpenseBookSummary: jest.fn(),
            getExpenseBookRecords: jest.fn(),
            getInventoryBookSummary: jest.fn(),
            getInventoryBookRecords: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AccountingBooksController>(
      AccountingBooksController,
    );
    service = module.get(AccountingBooksService) as any;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET expense/summary', () => {
    it('should call service.getExpenseBookSummary and return standard response', async () => {
      const mockResult = {
        activeBookKey: 'S2c-HKD',
        books: {},
        syncCode: 'mock-sync-code',
      };
      service.getExpenseBookSummary.mockResolvedValue(mockResult as any);

      const user = { id: 'user-123' } as any;
      const query = {
        timeFrame: TimeFrame.THANG_NAY,
      };

      const response = await controller.getExpenseBookSummary(user, query);

      expect(service.getExpenseBookSummary).toHaveBeenCalledWith(
        'user-123',
        TimeFrame.THANG_NAY,
        undefined,
      );
      expect(response).toEqual({
        success: true,
        message: 'Retrieve expense book summary successfully',
        data: mockResult,
      });
    });
  });

  describe('GET expense/records', () => {
    it('should call service.getExpenseBookRecords and return standard response', async () => {
      const mockResult = {
        rows: [],
        meta: { total: 0, page: 1, lastPage: 1 },
        activeBookKey: 'S2c-HKD',
        syncCode: 'mock-sync-code',
        isSummaryOutdated: false,
      };
      service.getExpenseBookRecords.mockResolvedValue(mockResult as any);

      const user = { id: 'user-123' } as any;
      const query = {
        timeFrame: TimeFrame.THANG_NAY,
        page: 1,
        limit: 20,
        syncCode: 'old-sync-code',
      };

      const response = await controller.getExpenseBookRecords(user, query);

      expect(service.getExpenseBookRecords).toHaveBeenCalledWith(
        'user-123',
        TimeFrame.THANG_NAY,
        undefined,
        1,
        20,
        'old-sync-code',
      );
      expect(response).toEqual({
        success: true,
        message: 'Retrieve expense book successfully',
        data: mockResult,
      });
    });
  });

  describe('GET inventory/summary', () => {
    it('should call service.getInventoryBookSummary and return standard response', async () => {
      const mockResult = {
        activeBookKey: 'S2d-HKD',
        books: {},
        syncCode: 'mock-sync-code',
      };
      service.getInventoryBookSummary.mockResolvedValue(mockResult as any);

      const user = { id: 'user-123' } as any;
      const query = {
        timeFrame: TimeFrame.THANG_NAY,
        productPublicIds: ['prod-1', 'prod-2'],
      };

      const response = await controller.getInventoryBookSummary(user, query);

      expect(service.getInventoryBookSummary).toHaveBeenCalledWith(
        'user-123',
        TimeFrame.THANG_NAY,
        ['prod-1', 'prod-2'],
        undefined,
      );
      expect(response).toEqual({
        success: true,
        message: 'Retrieve inventory book summary successfully',
        data: mockResult,
      });
    });
  });

  describe('GET inventory/records', () => {
    it('should call service.getInventoryBookRecords and return standard response', async () => {
      const mockResult = {
        rows: [],
        meta: { total: 0, page: 1, lastPage: 1 },
        activeBookKey: 'S2d-HKD',
        syncCode: 'mock-sync-code',
        isSummaryOutdated: false,
      };
      service.getInventoryBookRecords.mockResolvedValue(mockResult as any);

      const user = { id: 'user-123' } as any;
      const query = {
        timeFrame: TimeFrame.THANG_NAY,
        productPublicIds: ['prod-1'],
        page: 1,
        limit: 20,
        syncCode: 'old-sync-code',
      };

      const response = await controller.getInventoryBookRecords(user, query);

      expect(service.getInventoryBookRecords).toHaveBeenCalledWith(
        'user-123',
        TimeFrame.THANG_NAY,
        ['prod-1'],
        undefined,
        1,
        20,
        'old-sync-code',
      );
      expect(response).toEqual({
        success: true,
        message: 'Retrieve inventory book successfully',
        data: mockResult,
      });
    });
  });
});
