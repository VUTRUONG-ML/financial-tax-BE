import { Test, TestingModule } from '@nestjs/testing';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('VouchersController', () => {
  let controller: VouchersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VouchersController],
      providers: [
        {
          provide: VouchersService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VouchersController>(VouchersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
