import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../common/interface/jwt-payload.interface';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { parseTimeToMs, parseTimeToSeconds } from '../common/utils/time.util';
import { RequestUser } from 'src/common/interface/request-user.interface';
import { Prisma } from '@prisma/client';
export enum TokenType {
  ACCESS = 'ACCESS',
  REFRESH = 'REFRESH',
}

@Injectable()
export class TokenService {
  private readonly accessExpSeconds: number;
  private readonly refreshExpSeconds: number;
  private readonly refreshExpMs: number;
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const accessStr =
      this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
    const refreshStr =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';

    // Gọi trực tiếp util, trả về đúng number, linter không thể bắt bẻ
    this.accessExpSeconds = parseTimeToSeconds(accessStr, '15m');
    this.refreshExpMs = parseTimeToMs(refreshStr, '7d');
    this.refreshExpSeconds = Math.floor(this.refreshExpMs / 1000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Sinh ra cặp Access và Refresh Token cùng lúc
   */
  async generateAuthTokens(userId: string, role: string, phone: string) {
    const payload: JwtPayload = { sub: userId, role, phone };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessExpSeconds,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshExpSeconds,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Validate token và quăng lỗi chuyên biệt theo từng loại
   */
  async validateToken(token: string, type: TokenType): Promise<RequestUser> {
    try {
      // Xác định secret dựa vào loại token
      const secret =
        type === TokenType.ACCESS
          ? this.configService.get<string>('JWT_ACCESS_SECRET')
          : this.configService.get<string>('JWT_REFRESH_SECRET');

      // Hàm verifyAsync sẽ quăng lỗi nếu token hết hạn, sai chữ ký, hoặc bị sửa đổi
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
      return { id: payload.sub, phone: payload.phone, role: payload.role };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        // 401 - Token expired, Client nên thực hiện Refresh Token flow
        throw new UnauthorizedException({
          errorCode: `${type}_TOKEN_EXPIRED`,
          message: 'Access token has expired',
        });
      }

      if (error instanceof JsonWebTokenError) {
        // 401 - Token bị sai, giả mạo hoặc không hợp lệ
        throw new UnauthorizedException({
          errorCode: `INVALID_${type}_TOKEN`,
          message: 'Token signature is invalid',
        });
      }

      // Các lỗi hệ thống khác
      // thì bắn ra lỗi chung hoặc để NestJS tự handle
      throw new UnauthorizedException({
        errorCode: 'AUTH_FAILED',
        message: 'Authentication failed',
        statusCode: 401,
      });
    }
  }

  async saveRefreshToken(
    userId: string,
    refreshToken: string,
    ipAddress?: string | null,
    userAgent?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx || this.prismaService;
    // 1. Hash the token before saving
    const tokenHash = this.hashToken(refreshToken);

    // 2. Calculate expiration date
    const expiresAt = new Date(Date.now() + this.refreshExpMs);
    console.log('>>> expires:', expiresAt);
    // 3. Save to database
    const savedToken = await db.refreshToken.create({
      data: {
        userId: userId,
        tokenHash: tokenHash,
        expiresAt: expiresAt,
        isRevoked: false,
        ipAddress: ipAddress,
        userAgent: userAgent,
      },
    });

    return savedToken;
  }

  async refreshAuthTokens(rt: string) {
    // 1. FAIL-FAST: Kiểm tra tính hợp lệ của JWT
    const payload = await this.validateToken(rt, TokenType.REFRESH);

    // 2. Băm token JWT dài thành chuỗi SHA-256 ngắn gọn
    const hashedToken = this.hashToken(rt);

    // 3. Đảm bảo tính toàn vẹn dữ liệu bằng Transaction
    return await this.prismaService.$transaction(async (tx) => {
      const tokenRecord = await tx.refreshToken.findUnique({
        where: { tokenHash: hashedToken },
        include: { user: true },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException({ errorCode: 'INVALID_REFRESH_TOKEN' });
      }

      // Xử lý bảo mật: Phát hiện đánh cắp (Token Reuse)
      if (tokenRecord.isRevoked) {
        // Có người đang dùng lại một token đã bị thu hồi
        await tx.refreshToken.updateMany({
          where: { userId: payload.id, isRevoked: false },
          data: { isRevoked: true },
        });
        throw new UnauthorizedException({
          errorCode: 'SECURITY_BREACH',
          message: 'Unusual access detected. Please log in again.',
        });
      }

      // 4. Thu hồi token hiện tại
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { isRevoked: true },
      });

      // 5. Cấp lại cặp Token mới
      const newTokens = await this.generateAuthTokens(
        tokenRecord.user.id,
        tokenRecord.user.role,
        tokenRecord.user.phoneNumber,
      );

      // 6. Lưu mã băm của Refresh Token mới vào DB
      await this.saveRefreshToken(
        tokenRecord.user.id,
        newTokens.refreshToken,
        tokenRecord.ipAddress,
        tokenRecord.userAgent,
        tx,
      );

      return newTokens;
    });
  }
}
