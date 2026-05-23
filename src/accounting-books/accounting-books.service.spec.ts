import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksService } from './accounting-books.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { parseDateRange } from 'src/common/utils/date-range-parser.util';
import { moment } from 'src/common/utils/time.util';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

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
            },
          },
        },
      ],
    }).compile();

    service = module.get<AccountingBooksService>(AccountingBooksService);
    prisma = module.get(PrismaService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevenueBook', () => {
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
      },
      {
        id: 2,
        invoiceSymbol: null,
        issueDate: new Date('2026-05-12T15:00:00Z'),
        buyerName: null,
        totalPayment: 20000000,
      },
    ];

    it('should generate S1a-HKD only for taxGroupId 1', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 1,
        vatRateSnapShot: 0,
        pitRateSnapShot: 0,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);
      prisma.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await service.getRevenueBook('user-001', 'thang_nay');

      expect(result.activeBookKey).toBe('S1a-HKD');
      expect(result.books['S1a-HKD']).toBeDefined();
      expect(result.books['S2a-HKD']).toBeUndefined();
      expect(result.books['S2b-HKD']).toBeUndefined();

      const s1a = result.books['S1a-HKD'];
      expect(s1a.bookKey).toBe('S1A');
      expect(s1a.summary.tong_doanh_thu).toBe(30000000);
      expect(s1a.summary.so_luong_don_hang).toBe(2);
      expect(s1a.rows).toHaveLength(2);
      expect(s1a.rows[0]).toEqual({
        Ngay_Thang: mockInvoices[0].issueDate,
        Dien_Giai: 'Công ty A',
        So_Tien: 10000000,
      });
      expect(s1a.rows[1]).toEqual({
        Ngay_Thang: mockInvoices[1].issueDate,
        Dien_Giai: 'Ngành nghề kiểm thử',
        So_Tien: 20000000,
      });
    });

    it('should generate both S2a-HKD and S2b-HKD for taxGroupId 2', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 2,
        vatRateSnapShot: 0.01,
        pitRateSnapShot: 0.005,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);
      prisma.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await service.getRevenueBook('user-001', 'thang_nay');

      expect(result.activeBookKey).toBe('S2a-HKD');
      expect(result.books['S2a-HKD']).toBeDefined();
      expect(result.books['S2b-HKD']).toBeDefined();
      expect(result.books['S1a-HKD']).toBeUndefined();

      const s2a = result.books['S2a-HKD'];
      expect(s2a.bookKey).toBe('S2A');
      expect(s2a.summary.tong_doanh_thu).toBe(30000000);
      expect(s2a.summary.so_luong_don_hang).toBe(2);
      expect(s2a.rows[0]).toEqual({
        So_Hieu_Chung_Tu: '2C26TAA',
        Ngay_Thang: mockInvoices[0].issueDate,
        Dien_Giai: 'Công ty A',
        So_Tien: 10000000,
        Thue_GTGT: 100000,
      });
      expect(s2a.summary.Tong_Thue_TNCN_Phai_Nop).toBe(150000); // 30000000 * 0.005
      expect(s2a.summary.Tong_So_Thue_GTGT_Phai_Nop).toBe(300000); // 100000 + 200000

      const s2b = result.books['S2b-HKD'];
      expect(s2b.bookKey).toBe('S2B');
      expect(s2b.summary.Tong_So_Thue_GTGT_Phai_Nop).toBe(300000);
      expect(s2b.summary.Tong_Thue_TNCN_Phai_Nop).toBeUndefined();
    });

    it('should generate S2b-HKD only for taxGroupId 3 or 4', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 3,
        vatRateSnapShot: 0.03,
        pitRateSnapShot: 0.015,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);
      prisma.invoice.findMany.mockResolvedValue(mockInvoices as any);

      const result = await service.getRevenueBook('user-001', 'thang_nay');

      expect(result.activeBookKey).toBe('S2b-HKD');
      expect(result.books['S2b-HKD']).toBeDefined();
      expect(result.books['S2a-HKD']).toBeUndefined();
      expect(result.books['S1a-HKD']).toBeUndefined();

      const s2b = result.books['S2b-HKD'];
      expect(s2b.bookKey).toBe('S2B');
      expect(s2b.summary.tong_doanh_thu).toBe(30000000);
      expect(s2b.summary.so_luong_don_hang).toBe(2);
      expect(s2b.rows[0]).toEqual({
        So_Hieu_Chung_Tu: '2C26TAA',
        Ngay_Thang: mockInvoices[0].issueDate,
        Dien_Giai: 'Công ty A',
        So_Tien: 10000000,
        Thue_GTGT: 300000,
      });
      expect(s2b.summary.Tong_Thue_TNCN_Phai_Nop).toBeUndefined();
      expect(s2b.summary.Tong_So_Thue_GTGT_Phai_Nop).toBe(900000);
    });

    it('should throw NotFoundException if tax configuration is missing', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue(null);

      await expect(
        service.getRevenueBook('user-001', 'thang_nay'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
