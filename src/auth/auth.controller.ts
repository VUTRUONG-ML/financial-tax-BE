import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerPayload: CreateUserDto) {
    const data = await this.authService.register(registerPayload);
    return {
      message: 'Register success',
      data,
    };
  }

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
}
