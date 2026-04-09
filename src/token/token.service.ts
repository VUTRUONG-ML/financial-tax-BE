import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../common/interface/jwt-payload.interface';

export enum TokenType {
  ACCESS = 'ACCESS',
  REFRESH = 'REFRESH',
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sinh ra cặp Access và Refresh Token cùng lúc
   */
  async generateAuthTokens(userId: string, role: string, phone: string) {
    const payload = { sub: userId, role, phone };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
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
  async validateToken(token: string, type: TokenType): Promise<JwtPayload> {
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
      return payload;
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
}
