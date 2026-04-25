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
    throw new HttpException(
      'You re working too fast. Please try again later.',

      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as unknown as RequestWithUser;

    return request.user?.id?.toString() || request.ip;
  }
}
