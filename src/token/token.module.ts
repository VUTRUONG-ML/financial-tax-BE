import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TokenService } from './token.service';

@Module({
  imports: [
    ConfigModule, // Nạp ConfigModule để lấy biến môi trường
    JwtModule.register({}),
  ],
  providers: [TokenService],
  exports: [TokenService], // Export để AuthService có thể gọi được
})
export class TokenModule {}
