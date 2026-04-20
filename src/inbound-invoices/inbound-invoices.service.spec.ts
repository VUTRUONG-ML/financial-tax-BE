import { Test, TestingModule } from '@nestjs/testing';
import { InboundInvoicesService } from './inbound-invoices.service';

describe('InboundInvoicesService', () => {
  let service: InboundInvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InboundInvoicesService],
    }).compile();

    service = module.get<InboundInvoicesService>(InboundInvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
