import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

interface RequestWithUser {
  user?: { id: number | string };
  ip: string;
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlerException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // throttlerLimitDetail.timeToBlockMS: thời gian còn lại phải chờ (miligiây)
    const seconds = Math.ceil(throttlerLimitDetail.ttl / 1000);

    throw new BadRequestException({
      statusCode: 429,
      message: `You're working too fast. Please wait another ${seconds} seconds and try again.`,
      error: 'Too Many Requests',
    });
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as unknown as RequestWithUser;

    return request.user?.id?.toString() || request.ip;
  }
}
