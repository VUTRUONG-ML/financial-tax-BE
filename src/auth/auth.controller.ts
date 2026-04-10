import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}
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
  @HttpCode(HttpStatus.ACCEPTED)
  async login(@Body() loginDto: LoginDto) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto);
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
}
