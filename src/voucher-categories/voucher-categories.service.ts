import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVoucherCategoryDto } from './dto/create-voucher-category.dto';
import { UpdateVoucherCategoryDto } from './dto/update-voucher-category.dto';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class VoucherCategoriesService {
  private readonly log = new AppLogger(VoucherCategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    createVoucherCategoryDto: CreateVoucherCategoryDto,
  ) {
    const category = await this.prisma.voucherCategory.create({
      data: {
        ...createVoucherCategoryDto,
        userId,
      },
    });

    this.log.log(LOG_ACTIONS.CREATE_VOUCHER_CATEGORY, {
      status: LOG_STATUS.SUCCESS,
      userId,
      categoryId: category.id,
    });

    return category;
  }

  async findAll(userId: string) {
    return this.prisma.voucherCategory.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });
  }

  async update(
    userId: string,
    id: number,
    updateVoucherCategoryDto: UpdateVoucherCategoryDto,
  ) {
    const existing = await this.prisma.voucherCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Voucher category not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Cannot update system default category or other user category',
      );
    }

    const updated = await this.prisma.voucherCategory.update({
      where: { id },
      data: updateVoucherCategoryDto,
    });

    this.log.log(LOG_ACTIONS.UPDATE_VOUCHER_CATEGORY, {
      status: LOG_STATUS.SUCCESS,
      userId,
      categoryId: id,
    });

    return updated;
  }

  async remove(userId: string, id: number) {
    const existing = await this.prisma.voucherCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { vouchers: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Voucher category not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'Cannot delete system default category or other user category',
      );
    }

    if (existing._count.vouchers > 0) {
      this.log.warn(LOG_ACTIONS.DELETE_VOUCHER_CATEGORY, {
        status: LOG_STATUS.FAILED,
        reason: 'CATEGORY_IN_USE',
        userId,
        categoryId: id,
      });
      throw new BadRequestException(
        'Cannot delete category because it is already used in vouchers',
      );
    }

    await this.prisma.voucherCategory.delete({
      where: { id },
    });

    this.log.log(LOG_ACTIONS.DELETE_VOUCHER_CATEGORY, {
      status: LOG_STATUS.SUCCESS,
      userId,
      categoryId: id,
    });

    return true;
  }
}
