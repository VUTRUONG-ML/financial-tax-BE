import { Test, TestingModule } from '@nestjs/testing';
import { VouchersService } from './vouchers.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';

describe('VouchersService', () => {
  let service: VouchersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<VouchersService>(VouchersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
