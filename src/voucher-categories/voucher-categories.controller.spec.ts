import { Test, TestingModule } from '@nestjs/testing';
import { VoucherCategoriesController } from './voucher-categories.controller';

describe('VoucherCategoriesController', () => {
  let controller: VoucherCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoucherCategoriesController],
    }).compile();

    controller = module.get<VoucherCategoriesController>(VoucherCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
