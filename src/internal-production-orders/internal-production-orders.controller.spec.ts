import { Test, TestingModule } from '@nestjs/testing';
import { InternalProductionOrdersController } from './internal-production-orders.controller';

describe('InternalProductionOrdersController', () => {
  let controller: InternalProductionOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalProductionOrdersController],
    }).compile();

    controller = module.get<InternalProductionOrdersController>(InternalProductionOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
