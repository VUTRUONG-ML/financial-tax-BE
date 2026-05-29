import { Test, TestingModule } from '@nestjs/testing';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('VouchersController', () => {
  let controller: VouchersController;
  let service: VouchersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VouchersController],
      providers: [
        {
          provide: VouchersService,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VouchersController>(VouchersController);
    service = module.get<VouchersService>(VouchersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call create on service and return the result', async () => {
      const mockUserId = 'user-1';
      const mockDto = {
        voucherType: 'RECEIPT',
        categoryId: 1,
        content: 'Thu tien hang',
        amount: 1000000,
        paymentMethod: 'CASH',
        transactionAt: '2026-05-28T00:00:00.000Z',
        contactName: 'Nguyen Van A',
      };
      const mockResult = { id: 1, ...mockDto, voucherCode: 'PT-0526-0001' };

      jest.spyOn(service, 'create').mockResolvedValue(mockResult as any);

      const result = await controller.create(mockUserId, mockDto as any);

      expect(service.create).toHaveBeenCalledWith(mockUserId, mockDto);
      expect(result).toEqual({
        message: 'Voucher created successfully',
        data: mockResult,
      });
    });
  });
});
