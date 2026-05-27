import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersController } from './internal-production-orders.controller';
import { InternalProductionOrdersService } from './internal-production-orders.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('InternalProductionOrdersController', () => {
  let controller: InternalProductionOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalProductionOrdersController],
      providers: [
        {
          provide: InternalProductionOrdersService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InternalProductionOrdersController>(InternalProductionOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
