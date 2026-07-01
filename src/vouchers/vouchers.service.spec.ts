import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, VoucherType } from '@prisma/client';
import { VouchersService } from './vouchers.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';

describe('VouchersService', () => {
  let service: VouchersService;
  let prisma: { $transaction: jest.Mock };
  let auditLog: { logChange: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
    };
    auditLog = {
      logChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuditLogService,
          useValue: auditLog,
        },
      ],
    }).compile();

    service = module.get<VouchersService>(VouchersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates voucher when request amount is a number', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      voucherCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          type: VoucherType.PAYMENT,
          userId: null,
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      voucher: {
        create: jest.fn().mockResolvedValue({
          id: 10,
          voucherCode: 'PC-0726-0001',
          amount: 100000,
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (run) => run(tx));

    await expect(
      service.create('user-1', {
        voucherType: VoucherType.PAYMENT,
        categoryId: 1,
        content: 'Office supplies',
        amount: 100000,
        paymentMethod: PaymentMethod.CASH,
        transactionAt: '2026-07-01T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ voucherCode: 'PC-0726-0001' });

    expect(tx.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: expect.objectContaining({
            toString: expect.any(Function),
          }),
        }),
      }),
    );
  });

  it('rejects deductible cash voucher from 5 million without TypeError', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      voucherCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          type: VoucherType.PAYMENT,
          userId: null,
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (run) => run(tx));

    await expect(
      service.create('user-1', {
        voucherType: VoucherType.PAYMENT,
        categoryId: 1,
        content: 'Deductible expense',
        amount: 5000000,
        paymentMethod: PaymentMethod.CASH,
        transactionAt: '2026-07-01T00:00:00.000Z',
        isDeductibleExpense: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
