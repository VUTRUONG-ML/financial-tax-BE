import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

interface RequestWithUser {
  user?: { id: number | string };
  ip: string;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    // throttlerLimitDetail.timeToBlockMS: thời gian còn lại phải chờ (miligiây)
    const seconds = Math.ceil(throttlerLimitDetail.ttl / 1000);

    // Đính kèm dữ liệu vào request
    request['isThrottlerLog'] = true;
    request['throttlerWaitSeconds'] = seconds;

    // Ném lỗi để dừng Request tại đây
    throw new HttpException('ThrottlerException', HttpStatus.TOO_MANY_REQUESTS);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as unknown as RequestWithUser;

    return request.user?.id?.toString() || request.ip;
  }
}
