import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { parseTimeToMs } from '../common/utils/time.util';
import { TokenService } from '../token/token.service';
import { Cookie } from '../common/decorators/cookie.decorator';

@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}
  private setRefreshCookie(res: Response, refreshToken: string) {
    const refreshExpStr =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const maxAgeMs = parseTimeToMs(refreshExpStr, '7d');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, // Chống XSS
      secure: isProduction, // Yêu cầu HTTPS trên production
      sameSite: 'strict', // Chống CSRF
      maxAge: maxAgeMs,
    });
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerPayload: CreateUserDto) {
    const data = await this.authService.register(registerPayload);
    return {
      message: 'Register success',
      data,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      loginDto,
      ipAddress,
      userAgent,
    );

    this.setRefreshCookie(res, refreshToken);

    return {
      message: 'Login success.',
      data: {
        user,
        accessToken,
      },
    };
  }

  @Get('profile')
  @HttpCode(HttpStatus.ACCEPTED)
  async getProfile(@CurrentUser('phone') phoneNumber: string) {
    return await this.authService.getProfile(phoneNumber);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @Cookie('refreshToken') refreshToken: string,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    const { accessToken, refreshToken: newToken } =
      await this.tokenService.refreshAuthTokens(refreshToken);

    this.setRefreshCookie(res, newToken);

    return {
      message: 'Refresh success.',
      data: { accessToken },
    };
  }
}
