import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BusinessBankAccountsService } from '../business-bank-accounts/business-bank-accounts.service';
import { BkStkAccountItemDto, BkStkResponseDto } from './dto/bk-stk-response.dto';
import { CreateTaxFormDto, TaxFormListItemDto } from './dto/tax-form.dto';
import { plainToInstance } from 'class-transformer';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { mapToDto } from 'src/common/utils/mapper.util';
@Injectable()
export class TaxFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly businessBankAccountsService: BusinessBankAccountsService,
  ) {}

  async getBkStk(userId: string): Promise<BkStkResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const allAccounts = await this.businessBankAccountsService.findAll(userId);

    const activeAccounts = allAccounts.filter((a) => a.isActive);

    const accounts = activeAccounts.map((a) =>
      plainToInstance(BkStkAccountItemDto, a, {
        excludeExtraneousValues: true,
      }),
    );

    return plainToInstance(
      BkStkResponseDto,
      {
        businessName: user.businessName,
        taxCode: user.taxCode,
        ownerName: user.ownerName,
        address: '', // Để trống theo spec hiện tại
        phone: user.phoneNumber,
        accounts,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Tạo hoặc cập nhật bản ghi tờ khai và lưu file PDF được gửi từ client lên thư mục public/tax-forms
   */
  async createTaxForm(
    userId: string,
    dto: CreateTaxFormDto,
    file?: Express.Multer.File,
    tx?: any, // Sử dụng any hoặc Prisma.TransactionClient để tương thích ngược mà không cần import Prisma rộng rãi
  ) {
    const prismaClient = tx || this.prisma;

    // 1. Kiểm tra period tồn tại
    const period = await prismaClient.financialPeriod.findFirst({
      where: { id: dto.periodId, userId },
    });
    if (!period) {
      throw new NotFoundException('Financial period not found.');
    }

    // 2. Xử lý lưu file PDF nếu có gửi lên
    let pdfUrl: string | undefined;
    let filePathToClean: string | undefined;
    if (file) {
      try {
        const publicDir = path.join(process.cwd(), 'public', 'tax-forms');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }

        // Đặt tên file duy nhất: <cuid/uuid>-<originalName>
        const uniqueFileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const filePath = path.join(publicDir, uniqueFileName);

        // Ghi file
        fs.writeFileSync(filePath, file.buffer);
        filePathToClean = filePath;

        // Thiết lập link truy cập trực tiếp từ server
        pdfUrl = `/public/tax-forms/${uniqueFileName}`;
      } catch (error) {
        throw new BadRequestException('Failed to save PDF file on server.');
      }
    }

    try {
      // 3. Tìm bản ghi đã tồn tại (được tạo trước đó khi submit)
      const existingExport = await prismaClient.taxFormExport.findFirst({
        where: {
          periodId: dto.periodId,
          formType: dto.formType,
          createdBy: userId,
        },
      });

      if (existingExport) {
        // Cập nhật lại bản ghi cũ
        return await prismaClient.taxFormExport.update({
          where: { id: existingExport.id },
          data: {
            xmlContent: dto.xmlContent,
            taxYear: dto.taxYear,
            ...(pdfUrl ? { pdfUrl } : {}),
          },
        });
      }

      // Tạo mới nếu chưa tồn tại
      const taxFormExport = await prismaClient.taxFormExport.create({
        data: {
          formType: dto.formType,
          periodId: dto.periodId,
          taxYear: dto.taxYear,
          xmlContent: dto.xmlContent,
          pdfUrl: pdfUrl || null,
          exportStatus: 'SUCCESS',
          createdBy: userId,
        },
      });

      return taxFormExport;
    } catch (dbError) {
      // Rollback: Xóa file vật lý đã ghi nếu cập nhật DB thất bại
      if (filePathToClean && fs.existsSync(filePathToClean)) {
        try {
          fs.unlinkSync(filePathToClean);
        } catch (cleanupError) {
          // Ghi log warn nhưng không throw tiếp để giữ nguyên lỗi gốc dbError
        }
      }
      throw dbError;
    }
  }
}
