import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TokenService } from '../token/token.service';
import { PrismaService } from '../core/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByPhone: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateAuthTokens: jest.fn(),
            saveRefreshToken: jest.fn(),
            validateToken: jest.fn(),
            getToken: jest.fn(),
            markTokenRevoked: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            taxConfiguration: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mapUserProfile', () => {
    const mockUser = {
      id: 'user-123',
      phoneNumber: '0901234567',
      role: 'ADMIN',
      taxCode: '01010101',
      cccdNumber: '123456789012',
      businessName: 'Cửa hàng A',
      ownerName: 'Nguyễn Văn A',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      setUpCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    let prisma: jest.Mocked<PrismaService>;

    beforeEach(() => {
      prisma = service['prismaService'] as any;
    });

    it('should return default profile when taxConfig is null', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue(null);

      const result = await service['mapUserProfile'](mockUser);

      expect(result).toEqual({
        id: 'user-123',
        phone: '0901234567',
        role: 'ADMIN',
        tax_code: '01010101',
        cccd_number: '123456789012',
        business_name: 'Cửa hàng A',
        representative: 'Nguyễn Văn A',
        industry: 'TRADE',
        industry_label: 'Phân phối, cung cấp hàng hóa',
        tax_group: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        setUpCompletedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('should return mapped profile when taxConfig exists', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 3,
        industry: {
          id: 3,
          categoryName: 'Sản xuất, vận tải...',
        },
      } as any);

      const result = await service['mapUserProfile'](mockUser);

      expect(result).toEqual({
        id: 'user-123',
        phone: '0901234567',
        role: 'ADMIN',
        tax_code: '01010101',
        cccd_number: '123456789012',
        business_name: 'Cửa hàng A',
        representative: 'Nguyễn Văn A',
        industry: 'PRODUCTION',
        industry_label: 'Sản xuất, vận tải...',
        tax_group: 3,
        created_at: '2026-01-01T00:00:00.000Z',
        setUpCompletedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });
});
