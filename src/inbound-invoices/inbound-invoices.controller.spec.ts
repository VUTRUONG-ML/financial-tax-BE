import { Test, TestingModule } from '@nestjs/testing';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { InboundInvoicesService } from './inbound-invoices.service';
import { InvoiceSyncService } from './invoice-sync.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('InboundInvoicesController', () => {
  let controller: InboundInvoicesController;
  let service: InboundInvoicesService;
  let syncService: InvoiceSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundInvoicesController],
      providers: [
        {
          provide: InboundInvoicesService,
          useValue: {
            getSummary: jest.fn(),
            findAllInboundInvoices: jest.fn(),
            detailInboundInvoice: jest.fn(),
          },
        },
        {
          provide: InvoiceSyncService,
          useValue: {
            syncForUser: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InboundInvoicesController>(
      InboundInvoicesController,
    );
    service = module.get<InboundInvoicesService>(InboundInvoicesService);
    syncService = module.get<InvoiceSyncService>(InvoiceSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should call getSummary on service and return the result', async () => {
      const mockUserId = 'user-1';
      const mockSummary = {
        tong_so_luong_hoa_don: 5,
        tong_doanh_thu: 1000000,
        tong_chua_thanh_toan: 250000,
      };

      jest.spyOn(service, 'getSummary').mockResolvedValue(mockSummary);

      const result = await controller.getSummary(mockUserId);

      expect(service.getSummary).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual({
        message: 'Get inbound invoice summary success.',
        data: mockSummary,
      });
    });
  });

  describe('triggerSync', () => {
    it('should call syncForUser on syncService and return syncedCount', async () => {
      const mockUserId = 'user-1';
      jest.spyOn(syncService, 'syncForUser').mockResolvedValue(3);

      const result = await controller.triggerSync(mockUserId);

      expect(syncService.syncForUser).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual({
        message: 'Tax Authority invoice synchronization completed.',
        data: {
          syncedCount: 3,
        },
      });
    });
  });
});
