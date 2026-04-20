import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './token/token.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RequestLoggerMiddleware } from './common/middlewares/request-logger.middleware';
import { MetadataModule } from './metadata/metadata.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AuditLogModule } from './core/audit-log/audit-log.module';
import { ProductsModule } from './products/products.module';
import { InvoicesModule } from './invoices/invoices.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { TaxAuthorityModule } from './tax-authority/tax-authority.module';
import { InboundInvoicesModule } from './inbound-invoices/inbound-invoices.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    UsersModule,
    AuthModule,
    TokenModule,
    MetadataModule,
    OnboardingModule,
    AuditLogModule,
    ProductsModule,
    InvoicesModule,
    CloudinaryModule,
    TaxAuthorityModule,
    InboundInvoicesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Áp dụng bảo vệ cho toàn bộ hệ thống
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Áp dụng middleware tạo Request ID cho toàn bộ hệ thống
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
