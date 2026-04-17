import { Test, TestingModule } from '@nestjs/testing';
import { TaxAuthorityService } from './tax-authority.service';

describe('TaxAuthorityService', () => {
  let service: TaxAuthorityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxAuthorityService],
    }).compile();

    service = module.get<TaxAuthorityService>(TaxAuthorityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
