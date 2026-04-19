import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PitMethod } from '@prisma/client';
import { TAX_QUARTER_COOLDOWN_MS } from '../common/constants/tax-period-time.constant';

// ─── MOCK FACTORIES ─────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-cuid-001';
const MOCK_POPULAR_TAG_ID = 1;
const MOCK_TAX_CATEGORY_ID = 10;
const MOCK_TAX_GROUP_ID = 2;
const MOCK_PIT_METHOD = PitMethod.PERCENTAGE;

/** Base DTO dùng chung, mỗi test có thể override */
const baseDto = () => ({
  industryId: MOCK_POPULAR_TAG_ID,
  taxGroupId: MOCK_TAX_GROUP_ID,
  pitMethod: MOCK_PIT_METHOD,
  isOtherIndustry: false,
});

/** TaxGroup hợp lệ với phương pháp PERCENTAGE */
const mockTaxGroup = () => ({
  id: MOCK_TAX_GROUP_ID,
  allowedMethods: [PitMethod.PERCENTAGE],
});

/** TaxCategory với thuế suất hợp lệ */
const mockTaxCategory = () => ({
  id: MOCK_TAX_CATEGORY_ID,
  vatRate: 0.05,
  pitRate: 0.02,
  parentId: null,
});

/** Popular Tag trỏ tới taxCategory */
const mockPopularTag = () => ({
  id: MOCK_POPULAR_TAG_ID,
  mappedTaxId: MOCK_TAX_CATEGORY_ID,
});

/** TaxConfiguration đang active (chưa đóng) */
const mockActiveConfig = (overrides = {}) => ({
  id: 'config-cuid-001',
  userId: MOCK_USER_ID,
  industryId: MOCK_TAX_CATEGORY_ID,
  taxGroupId: MOCK_TAX_GROUP_ID,
  applyFromDate: new Date(Date.now() - TAX_QUARTER_COOLDOWN_MS - 1000), // Đã qua đủ 90 ngày
  applyToDate: null,
  vatRateSnapShot: 0.05,
  pitRateSnapShot: 0.02,
  ...overrides,
});

// ─── MOCK PRISMA TX ─────────────────────────────────────────────────────────

/**
 * Tạo mock Prisma Transaction Client với các method cần thiết.
 * Mỗi test sẽ override từng method theo kịch bản cụ thể.
 */
const buildMockTx = (overrides: Record<string, unknown> = {}) => ({
  taxConfiguration: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  taxGroup: {
    findUnique: jest.fn().mockResolvedValue(mockTaxGroup()),
  },
  taxCategory: {
    findUnique: jest.fn().mockResolvedValue(mockTaxCategory()),
  },
  uiPopularTag: {
    findUnique: jest.fn().mockResolvedValue(mockPopularTag()),
  },
  user: {
    update: jest.fn().mockResolvedValue({}),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  ...overrides,
});

// ─── SETUP ───────────────────────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logChange: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    prisma = module.get(PrismaService);
    auditLog = module.get(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // setupTaxConfiguration
  // ═══════════════════════════════════════════════════════════════════════════
  describe('setupTaxConfiguration', () => {
    /**
     * Helper: cấu hình prisma.$transaction để chạy callback với tx đã cho.
     * Cho phép test kiểm soát hoàn toàn trạng thái bên trong transaction.
     */
    const arrangeTx = (tx: ReturnType<typeof buildMockTx>) => {
      (prisma.$transaction as jest.Mock).mockImplementation((cb) => cb(tx));
    };

    // ── Happy path ──────────────────────────────────────────────────────────
    it('should create a new tax configuration for a first-time user', async () => {
      const newConfigId = 'new-config-001';
      const tx = buildMockTx();

      tx.taxConfiguration.findFirst.mockResolvedValue(null); // Chưa có config
      tx.taxConfiguration.create.mockResolvedValue({
        id: newConfigId,
        userId: MOCK_USER_ID,
        industryId: MOCK_TAX_CATEGORY_ID,
        taxGroupId: MOCK_TAX_GROUP_ID,
      });
      arrangeTx(tx);

      const result = await service.setupTaxConfiguration(
        MOCK_USER_ID,
        baseDto(),
      );

      expect(result.id).toBe(newConfigId);
      expect(tx.taxConfiguration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: MOCK_USER_ID,
            industryId: MOCK_TAX_CATEGORY_ID,
            taxGroupId: MOCK_TAX_GROUP_ID,
          }),
        }),
      );
      expect(auditLog.logChange).toHaveBeenCalledWith(
        tx,
        MOCK_USER_ID,
        'CREATE',
        expect.anything(),
        newConfigId,
        null,
        expect.any(Object),
      );
    });

    it('should snapshot vatRate and pitRate from the resolved tax category', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      tx.taxConfiguration.create.mockResolvedValue({ id: 'cfg-snap' });
      arrangeTx(tx);

      await service.setupTaxConfiguration(MOCK_USER_ID, baseDto());

      expect(tx.taxConfiguration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vatRateSnapShot: mockTaxCategory().vatRate,
            pitRateSnapShot: mockTaxCategory().pitRate,
          }),
        }),
      );
    });

    // ── Guard: đã onboarding rồi ────────────────────────────────────────────
    it('should throw ConflictException when user already completed onboarding', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue({ id: 'existing-cfg' });
      arrangeTx(tx);

      await expect(
        service.setupTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(ConflictException);

      expect(tx.taxConfiguration.create).not.toHaveBeenCalled();
    });

    // ── Guard: popular tag không tồn tại ────────────────────────────────────
    it('should throw NotFoundException when popular tag does not exist', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      tx.uiPopularTag.findUnique.mockResolvedValue(null); // Tag không có
      arrangeTx(tx);

      await expect(
        service.setupTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(NotFoundException);
    });

    // ── Guard: tax group không tồn tại ──────────────────────────────────────
    it('should throw NotFoundException when tax group does not exist', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      tx.taxGroup.findUnique.mockResolvedValue(null); // Group không có
      arrangeTx(tx);

      await expect(
        service.setupTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(NotFoundException);
    });

    // ── Guard: PIT method không được phép cho tax group này ─────────────────
    it('should throw BadRequestException when pitMethod is not allowed for the tax group', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      // Group này chỉ cho phép STANDARD, không cho PRESUMPTIVE
      tx.taxGroup.findUnique.mockResolvedValue({
        id: MOCK_TAX_GROUP_ID,
        allowedMethods: [PitMethod.EXEMPT], // Chỉ cho phép EXEMPT
      });
      // Thêm mock create để tránh TypeError nếu guard không chặn trước
      tx.taxConfiguration.create.mockResolvedValue({ id: 'should-not-reach' });
      arrangeTx(tx);

      await expect(
        service.setupTaxConfiguration(MOCK_USER_ID, {
          ...baseDto(),
          pitMethod: PitMethod.PERCENTAGE, // Gửi PERCENTAGE nhưng group chỉ cho EXEMPT
        }),
      ).rejects.toThrow(BadRequestException);

      // Đảm bảo guard đã ngăn create không được gọi
      expect(tx.taxConfiguration.create).not.toHaveBeenCalled();
    });

    // ── Luồng isOtherIndustry: dùng taxCategory trực tiếp ──────────────────
    it('should use taxCategory directly when isOtherIndustry is true', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      tx.taxConfiguration.create.mockResolvedValue({ id: 'cfg-other' });
      arrangeTx(tx);

      await service.setupTaxConfiguration(MOCK_USER_ID, {
        ...baseDto(),
        industryId: MOCK_TAX_CATEGORY_ID,
        isOtherIndustry: true,
      });

      // Không đi qua uiPopularTag
      expect(tx.uiPopularTag.findUnique).not.toHaveBeenCalled();
      // Đi thẳng vào taxCategory
      expect(tx.taxCategory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_TAX_CATEGORY_ID },
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateTaxConfiguration
  // ═══════════════════════════════════════════════════════════════════════════
  describe('updateTaxConfiguration', () => {
    const arrangeTx = (tx: ReturnType<typeof buildMockTx>) => {
      (prisma.$transaction as jest.Mock).mockImplementation((cb) => cb(tx));
    };

    // ── Happy path ──────────────────────────────────────────────────────────
    it('should close the current config and create a new one', async () => {
      const tx = buildMockTx();
      const activeConfig = mockActiveConfig(); // applyFromDate đã quá 90 ngày
      tx.taxConfiguration.findFirst.mockResolvedValue(activeConfig);
      tx.taxConfiguration.updateMany.mockResolvedValue({ count: 1 }); // Đóng thành công
      tx.taxConfiguration.create.mockResolvedValue({
        id: 'new-cfg-002',
        userId: MOCK_USER_ID,
      });
      arrangeTx(tx);

      const result = await service.updateTaxConfiguration(
        MOCK_USER_ID,
        baseDto(),
      );

      expect(tx.taxConfiguration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: activeConfig.id,
            applyToDate: null,
          }),
          data: expect.objectContaining({ applyToDate: expect.any(Date) }),
        }),
      );
      expect(result.id).toBe('new-cfg-002');
      // AuditLog ghi 2 lần: 1 UPDATE (đóng) + 1 CREATE (mở mới)
      expect(auditLog.logChange).toHaveBeenCalledTimes(2);
    });

    // ── Guard: chưa có config active ────────────────────────────────────────
    it('should throw BadRequestException when no active config found', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(null);
      arrangeTx(tx);

      await expect(
        service.updateTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(BadRequestException);
    });

    // ── Guard: cập nhật quá sớm (trước 90 ngày) ─────────────────────────────
    it('should throw BadRequestException when user tries to update before cooldown period', async () => {
      const tx = buildMockTx();
      // applyFromDate chỉ 1 ngày trước → chưa đủ 90 ngày
      const recentConfig = mockActiveConfig({
        applyFromDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      tx.taxConfiguration.findFirst.mockResolvedValue(recentConfig);
      arrangeTx(tx);

      await expect(
        service.updateTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(BadRequestException);

      expect(tx.taxConfiguration.updateMany).not.toHaveBeenCalled();
    });

    // ── Guard: cooldown bypass khi isSystemAutoUpgrade = true ───────────────
    it('should bypass cooldown check when isSystemAutoUpgrade is true', async () => {
      const tx = buildMockTx();
      // Config chỉ 1 ngày trước — nhưng system upgrade thì được bỏ qua check
      const recentConfig = mockActiveConfig({
        applyFromDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      tx.taxConfiguration.findFirst.mockResolvedValue(recentConfig);
      tx.taxConfiguration.updateMany.mockResolvedValue({ count: 1 });
      tx.taxConfiguration.create.mockResolvedValue({ id: 'sys-cfg-003' });
      arrangeTx(tx);

      const result = await service.updateTaxConfiguration(
        MOCK_USER_ID,
        baseDto(),
        { isSystemAutoUpgrade: true },
      );

      expect(result.id).toBe('sys-cfg-003');
    });

    // ── Guard: Optimistic Locking — double click ─────────────────────────────
    it('should throw ConflictException when optimistic lock fails (double click)', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(mockActiveConfig());
      // Ai đó đã đóng config này rồi → updateMany trả về count = 0
      tx.taxConfiguration.updateMany.mockResolvedValue({ count: 0 });
      arrangeTx(tx);

      await expect(
        service.updateTaxConfiguration(MOCK_USER_ID, baseDto()),
      ).rejects.toThrow(ConflictException);

      expect(tx.taxConfiguration.create).not.toHaveBeenCalled();
    });

    // ── Guard: actionBy là SYSTEM_AUTO khi system upgrade ───────────────────
    it('should record audit log with SYSTEM_AUTO as actor when isSystemAutoUpgrade', async () => {
      const tx = buildMockTx();
      tx.taxConfiguration.findFirst.mockResolvedValue(mockActiveConfig());
      tx.taxConfiguration.updateMany.mockResolvedValue({ count: 1 });
      tx.taxConfiguration.create.mockResolvedValue({ id: 'sys-auto' });
      arrangeTx(tx);

      await service.updateTaxConfiguration(MOCK_USER_ID, baseDto(), {
        isSystemAutoUpgrade: true,
      });

      // Cả 2 lần log phải dùng 'SYSTEM_AUTO' thay vì userId
      expect(auditLog.logChange).toHaveBeenCalledWith(
        tx,
        'SYSTEM_AUTO',
        'UPDATE',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
