import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppLogger } from '../../common/logger/app-logger.service';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private log = new AppLogger(PrismaService.name);
  constructor(private readonly configService: ConfigService) {
    const linkUrl = configService.get<string>('DATABASE_URL');
    const pool = new Pool({ connectionString: linkUrl });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.log.log('Connected DB success!');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
