import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllTaxGroup() {
    return await this.prisma.taxGroup.findMany();
  }
  async findAllIndustry() {
    return await this.prisma.uiPopularTag.findMany();
  }
}
