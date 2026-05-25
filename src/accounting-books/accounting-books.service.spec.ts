import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksService } from './accounting-books.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { parseDateRange } from 'src/common/utils/date-range-parser.util';
import { moment } from 'src/common/utils/time.util';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { Decimal } from '@prisma/client/runtime/client';

describe('DateRangeParser', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-05-22T17:30:00+07:00 is Friday
    jest.setSystemTime(new Date('2026-05-22T17:30:00+07:00').getTime());
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should parse thang_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('thang_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-01 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse thang_truoc correctly', () => {
    const { startDate, endDate } = parseDateRange('thang_truoc');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-04-01 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-04-30 23:59:59');
  });

  it('should parse quy_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('quy_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-04-01 00:00:00'); // Q2 starts in April
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse nam_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('nam_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-01-01 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse nam_truoc correctly', () => {
    const { startDate, endDate } = parseDateRange('nam_truoc');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2025-01-01 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2025-12-31 23:59:59');
  });

  it('should parse 7_ngay_qua correctly', () => {
    const { startDate, endDate } = parseDateRange('7_ngay_qua');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-15 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse 30_ngay_qua correctly', () => {
    const { startDate, endDate } = parseDateRange('30_ngay_qua');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-04-22 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse tuan_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('tuan_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-18 00:00:00'); // May 18th is Monday of that week
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-22 23:59:59');
  });

  it('should parse tuan_truoc correctly', () => {
    const { startDate, endDate } = parseDateRange('tuan_truoc');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-11 00:00:00'); // Monday of previous week
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-05-17 23:59:59'); // Sunday of previous week
  });

  it('should parse custom correctly', () => {
    const customRange = {
      startDate: new Date('2026-02-10T12:00:00+07:00'),
      endDate: new Date('2026-02-20T12:00:00+07:00'),
    };
    const { startDate, endDate } = parseDateRange('custom', customRange);
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-02-10 00:00:00');
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-02-20 23:59:59');
  });

  it('should throw BadRequestException for missing customRange', () => {
    expect(() => parseDateRange('custom')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for unsupported timeframe', () => {
    expect(() => parseDateRange('future')).toThrow(BadRequestException);
  });

});

describe('AccountingBooksService', () => {
  let service: AccountingBooksService;
  let prisma: jest.Mocked<PrismaService>;
  let taxEngine: jest.Mocked<TaxEngineService>;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-22T17:30:00+07:00').getTime());
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingBooksService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            taxConfiguration: {
              findFirst: jest.fn(),
            },
            invoice: {
              findMany: jest.fn(),
              aggregate: jest.fn(),
              count: jest.fn(),
            },
            voucher: {
              aggregate: jest.fn(),
            },
          },
        },
        {
          provide: TaxEngineService,
          useValue: {
            calculateTotalTax: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccountingBooksService>(AccountingBooksService);
    prisma = module.get(PrismaService) as any;
    taxEngine = module.get(TaxEngineService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevenueBookSummary and Records', () => {
    const mockUser = {
      id: 'user-001',
      businessName: 'Business Test',
      taxCode: '1234567890',
      ownerName: 'John Doe',
    };

    const mockInvoices = [
      {
        id: 1,
        invoiceSymbol: '2C26TAA',
        issueDate: new Date('2026-05-10T10:00:00Z'),
        buyerName: 'Công ty A',
        totalPayment: 10000000,
        taxPayable: 100000,
      },
      {
        id: 2,
        invoiceSymbol: null,
        issueDate: new Date('2026-05-12T15:00:00Z'),
        buyerName: null,
        totalPayment: 20000000,
        taxPayable: 200000,
      },
    ];

    beforeEach(() => {
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalPayment: new Decimal(30000000) as any },
        _count: { id: 2 },
        _max: { updatedAt: new Date() }
      } as any);

      prisma.voucher.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(0) as any },
        _count: { id: 0 },
        _max: { updatedAt: new Date() }
      } as any);

      prisma.invoice.count.mockResolvedValue(2);
      prisma.invoice.findMany.mockResolvedValue(mockInvoices as any);
      
      taxEngine.calculateTotalTax.mockImplementation((rev, exp) => {
        const pitRate = 0.005; // mock 0.5%
        return {
          totalTaxDue: new Decimal(Number(rev) * (0.01 + 0.005)),
          vatAmount: new Decimal(Number(rev) * 0.01),
        } as any;
      });
    });

    it('should generate summary for S1a-HKD only for taxGroupId 1', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 1,
        vatRateSnapShot: 0,
        pitRateSnapShot: 0,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookSummary('user-001', 'thang_nay');

      expect(result.activeBookKey).toBe('S1a-HKD');
      expect(result.books['S1a-HKD']).toBeDefined();
      expect(result.books['S2a-HKD']).toBeUndefined();
      expect(result.books['S2b-HKD']).toBeUndefined();

      const s1a = result.books['S1a-HKD'];
      expect(s1a.bookKey).toBe('S1A');
      expect(s1a.summary.tong_doanh_thu).toBe(30000000);
      expect(s1a.summary.so_luong_don_hang).toBe(2);
    });

    it('should generate both S2a-HKD and S2b-HKD summary for taxGroupId 2', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 2,
        vatRateSnapShot: 0.01,
        pitRateSnapShot: 0.005,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookSummary('user-001', 'thang_nay');

      expect(result.activeBookKey).toBe('S2a-HKD');
      expect(result.books['S2a-HKD']).toBeDefined();
      expect(result.books['S2b-HKD']).toBeDefined();

      const s2a = result.books['S2a-HKD'];
      expect(s2a.summary.tong_doanh_thu).toBe(30000000);
      expect(s2a.summary.so_luong_don_hang).toBe(2);
      expect(s2a.summary.Tong_Thue_TNCN_Phai_Nop).toBe(150000);
      expect(s2a.summary.Tong_So_Thue_GTGT_Phai_Nop).toBe(300000);
    });

    it('should retrieve records with activeBookKey S1a-HKD for taxGroupId 1', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 1,
        vatRateSnapShot: 0,
        pitRateSnapShot: 0,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookRecords('user-001', 'thang_nay');
      expect(result.activeBookKey).toBe('S1a-HKD');
      expect(result.rows).toHaveLength(2);
      expect(result.syncCode).toBeDefined();
    });

    it('should throw NotFoundException if tax configuration is missing', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue(null);

      await expect(
        service.getRevenueBookSummary('user-001', 'thang_nay'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
