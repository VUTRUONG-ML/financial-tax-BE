import { Test, TestingModule } from '@nestjs/testing';
import { TaxAuthorityController } from './tax-authority.controller';
import { TaxAuthorityService } from './tax-authority.service';

describe('TaxAuthorityController', () => {
  let controller: TaxAuthorityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxAuthorityController],
      providers: [TaxAuthorityService],
    }).compile();

    controller = module.get<TaxAuthorityController>(TaxAuthorityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
