import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../common/interface/jwt-payload.interface';
import { RequestUser } from 'src/common/interface/request-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new UnauthorizedException('JWT_ACCESS_SECRET missing');
    }
    super({
      // Lấy token từ Header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Bỏ qua việc hết hạn? (false = tự động reject nếu token hết hạn)
      ignoreExpiration: false,
      // Secret key dùng để verify
      secretOrKey: secret,
    });
  }

  /**
   * Hàm này chỉ được gọi khi token ĐÃ VALID (đúng chữ ký, chưa hết hạn).
   * Giá trị return ở đây sẽ được NestJS tự động gán vào `req.user`.
   */
  validate(payload: JwtPayload): RequestUser {
    return {
      id: payload.sub,
      role: payload.role,
      phone: payload.phone,
    };
  }
}
