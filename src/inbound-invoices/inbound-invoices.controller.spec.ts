import { Test, TestingModule } from '@nestjs/testing';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { InboundInvoicesService } from './inbound-invoices.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('InboundInvoicesController', () => {
  let controller: InboundInvoicesController;
  let service: InboundInvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundInvoicesController],
      providers: [
        {
          provide: InboundInvoicesService,
          useValue: {
            getSummary: jest.fn(),
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
});
