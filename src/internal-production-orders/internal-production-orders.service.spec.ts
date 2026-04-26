import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersService } from './internal-production-orders.service';

describe('InternalProductionOrdersService', () => {
  let service: InternalProductionOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InternalProductionOrdersService],
    }).compile();

    service = module.get<InternalProductionOrdersService>(InternalProductionOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
