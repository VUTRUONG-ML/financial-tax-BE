import { Test, TestingModule } from '@nestjs/testing';
import { VoucherCategoriesService } from './voucher-categories.service';

describe('VoucherCategoriesService', () => {
  let service: VoucherCategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VoucherCategoriesService],
    }).compile();

    service = module.get<VoucherCategoriesService>(VoucherCategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
