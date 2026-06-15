import { Test, TestingModule } from '@nestjs/testing';
import { TaxAuthorityConnectionsService } from './tax-authority-connections.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';

describe('TaxAuthorityConnectionsService', () => {
  let service: TaxAuthorityConnectionsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxAuthorityConnectionsService,
        {
          provide: PrismaService,
          useValue: {
            taxAuthorityConnection: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logChange: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaxAuthorityConnectionsService>(
      TaxAuthorityConnectionsService,
    );
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
