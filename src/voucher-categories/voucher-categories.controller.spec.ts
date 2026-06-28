import { Test, TestingModule } from '@nestjs/testing';
import { VoucherCategoriesController } from './voucher-categories.controller';
import { VoucherCategoriesService } from './voucher-categories.service';

describe('VoucherCategoriesController', () => {
  let controller: VoucherCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoucherCategoriesController],
      providers: [
        {
          provide: VoucherCategoriesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<VoucherCategoriesController>(
      VoucherCategoriesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
