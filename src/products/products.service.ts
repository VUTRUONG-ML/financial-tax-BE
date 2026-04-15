import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { LOG_STATUS } from 'src/common/constants/log-events.constant';

@Injectable()
export class ProductsService {
  private readonly log = new AppLogger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────
  async create(
    userId: string,
    dto: CreateProductDto,
    file: Express.Multer.File,
  ) {
    const imageData = { url: '', publicId: '' };

    if (file) {
      try {
        const uploadResult = await this.cloudinaryService.uploadFile(file);
        imageData.url = uploadResult.secure_url as string;
        imageData.publicId = uploadResult.public_id as string;
      } catch (error) {
        // Nếu upload lỗi, quăng exception để dừng toàn bộ flow
        this.log.warn('CREATE_PRODUCT', {
          status: LOG_STATUS.FAILED,
          reason: 'CANNOT_UPLOAD_IMAGE',
          userId,
        });
        throw new BadRequestException(
          'Unable to load product image, please try again.',
        );
      }
    }

    const qty = dto.openingStockQuantity ?? 0;
    const unitCost = dto.openingStockUnitCost ?? 0;
    const openingStockValue = qty * unitCost;

    try {
      const product = await this.prisma.product.create({
        data: {
          userId,
          productName: dto.productName,
          skuCode: dto.skuCode,
          unit: dto.unit,
          imageUrl: imageData.url,
          imagePublicId: imageData.publicId,
          sellingPrice: dto.sellingPrice,
          openingStockQuantity: qty,
          openingStockUnitCost: unitCost,
          openingStockValue,
          // Khởi tạo cache tồn kho = số lượng đầu kỳ
          currentStock: qty,
        },
      });
      this.log.log('Product created', { userId, publicId: product.publicId });
      return product;
    } catch (dbError) {
      // TRICK CAO CẤP: Nếu lưu DB lỗi, ta nên xóa ảnh vừa upload trên Cloudinary
      // để tránh rác server (Rollback ảnh)
      // if (imageData.publicId) {
      //   await this.cloudinaryService.deleteFile(imageData.publicId);
      // }
      throw new InternalServerErrorException('Database save product error.');
    }
  }

  // ─── FIND ALL ─────────────────────────────────────────────────────────────
  async findAll(userId: string) {
    return this.prisma.product.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        publicId: true,
        skuCode: true,
        productName: true,
        unit: true,
        imageUrl: true,
        sellingPrice: true,
        openingStockQuantity: true,
        openingStockUnitCost: true,
        openingStockValue: true,
        currentStock: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────
  async findOneByPublicId(userId: string, publicId: string) {
    const product = await this.prisma.product.findUnique({
      where: { publicId },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('You do not have access to this product.');
    }

    return product;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  async update(userId: string, publicId: string, dto: UpdateProductDto) {
    // Kiểm tra tồn tại & ownership
    const current = await this.findOneByPublicId(userId, publicId);

    // Spread DTO fields (currentStock không có trong UpdateProductDto)
    const {
      productName,
      skuCode,
      unit,
      sellingPrice,
      openingStockQuantity,
      openingStockUnitCost,
    } = dto;

    // Tính lại openingStockValue nếu user cập nhật số lượng hoặc đơn giá vốn
    const qty = openingStockQuantity ?? current.openingStockQuantity;
    const cost = openingStockUnitCost ?? Number(current.openingStockUnitCost);
    const openingStockValue = Number(qty) * Number(cost);

    const updated = await this.prisma.product.update({
      where: { publicId },
      data: {
        ...(productName !== undefined && { productName }),
        ...(skuCode !== undefined && { skuCode }),
        ...(unit !== undefined && { unit }),
        ...(sellingPrice !== undefined && { sellingPrice }),
        ...(openingStockQuantity !== undefined && { openingStockQuantity }),
        ...(openingStockUnitCost !== undefined && { openingStockUnitCost }),
        openingStockValue,
      },
    });

    this.log.log('Product updated', { userId, publicId });
    return updated;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────
  async remove(userId: string, publicId: string) {
    // Kiểm tra tồn tại & ownership
    await this.findOneByPublicId(userId, publicId);

    await this.prisma.product.delete({ where: { publicId } });

    this.log.log('Product deleted', { userId, publicId });
    return { message: 'Product deleted successfully.' };
  }
}
