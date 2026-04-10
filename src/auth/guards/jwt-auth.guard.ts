import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Kiểm tra xem route hoặc controller có gắn @Public() không
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // Bỏ qua check token
    }

    // Nếu không phải Public, chạy logic check token mặc định của Passport
    return super.canActivate(context);
  }

  // Tùy chỉnh lỗi trả về để đồng bộ với chuẩn lỗi
  handleRequest<TUser>(err: any, user: any, info: Error): TUser {
    // Nếu token hết hạn, info sẽ là một Error tên là 'TokenExpiredError'
    if (info && info.name === 'TokenExpiredError') {
      throw new UnauthorizedException({
        errorCode: 'ACCESS_TOKEN_EXPIRED',
        message: 'Access token has expired',
      });
    }

    if (info && info.name === 'JsonWebTokenError') {
      throw new UnauthorizedException({
        errorCode: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid token signature or format',
      });
    }

    // Các lỗi khác (sai chữ ký, không có token...)
    if (err || !user) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_FAILED',
        message: 'Token signature is invalid or missing',
      });
    }

    return user as TUser;
  }
}
