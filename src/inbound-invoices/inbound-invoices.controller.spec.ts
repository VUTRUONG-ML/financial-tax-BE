import { Test, TestingModule } from '@nestjs/testing';
import { InboundInvoicesController } from './inbound-invoices.controller';
import { InboundInvoicesService } from './inbound-invoices.service';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';

describe('InboundInvoicesController', () => {
  let controller: InboundInvoicesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboundInvoicesController],
      providers: [
        {
          provide: InboundInvoicesService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(PeriodLockGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InboundInvoicesController>(
      InboundInvoicesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
