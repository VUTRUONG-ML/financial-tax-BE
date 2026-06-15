import { Test, TestingModule } from '@nestjs/testing';
import { TaxAuthorityConnectionsController } from './tax-authority-connections.controller';
import { TaxAuthorityConnectionsService } from './tax-authority-connections.service';

describe('TaxAuthorityConnectionsController', () => {
  let controller: TaxAuthorityConnectionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxAuthorityConnectionsController],
      providers: [
        {
          provide: TaxAuthorityConnectionsService,
          useValue: {
            getConnection: jest.fn(),
            upsertConnection: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TaxAuthorityConnectionsController>(
      TaxAuthorityConnectionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
