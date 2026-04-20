import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

  private safeDeleteImage(publicId: string) {
    this.cloudinaryService.deleteFile(publicId).catch((error: Error) => {
      this.log.warn(`[Cleanup] IMAGE`, {
        status: LOG_STATUS.FAILED,
        reason: error.message,
        imageId: publicId,
      });
    });
  }

  // Xử lí upload ảnh
  private async handleImageUpload(userId: string, file?: Express.Multer.File) {
    if (!file) return { url: undefined, publicId: undefined };

    try {
      const result = await this.cloudinaryService.uploadFile(file);

      return {
        url: result.secure_url as string,
        publicId: result.public_id as string,
      };
    } catch (error) {
      this.log.warn('IMAGE_UPLOAD_FAILED', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new BadRequestException(
        'Unable to load product image, please try again.',
      );
    }
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────
  async create(
    userId: string,
    dto: CreateProductDto,
    file?: Express.Multer.File,
  ) {
    const imageData = await this.handleImageUpload(userId, file);

    const qty = dto.openingStockQuantity ?? 0;
    const unitCost = dto.openingStockUnitCost ?? 0;
    const openingStockValue = qty * unitCost;

    try {
      const product = await this.prisma.product.create({
        data: {
          userId,
          productName: dto.productName,
          productType: dto.productType,
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
      // chèn vào bảng Sổ kho (S05-HKD) với diễn giải là "Kết chuyển số dư đầu kỳ".
      return product;
    } catch (dbError) {
      // TRICK CAO CẤP: Nếu lưu DB lỗi, ta nên xóa ảnh vừa upload trên Cloudinary
      // để tránh rác server (Rollback ảnh)
      if (imageData.publicId) {
        this.safeDeleteImage(imageData.publicId);
      }
      throw dbError;
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
  async update(
    userId: string,
    publicId: string,
    dto: UpdateProductDto,
    file?: Express.Multer.File,
  ) {
    // Kiểm tra tồn tại & ownership
    const current = await this.findOneByPublicId(userId, publicId);
    const oldImage = current.imagePublicId ?? '';
    const imageData = await this.handleImageUpload(userId, file);

    // Spread DTO fields (currentStock không có trong UpdateProductDto)
    const { openingStockQuantity, openingStockUnitCost } = dto;

    // Tính lại openingStockValue nếu user cập nhật số lượng hoặc đơn giá vốn
    const qty = openingStockQuantity ?? current.openingStockQuantity;
    const cost = openingStockUnitCost ?? Number(current.openingStockUnitCost);
    const openingStockValue = Number(qty) * Number(cost);

    try {
      const updated = await this.prisma.product.update({
        where: { publicId },
        data: {
          ...dto,
          ...(imageData.url && {
            imageUrl: imageData.url,
            imagePublicId: imageData.publicId,
          }),
          openingStockValue,
        },
      });

      // Nếu người dùng up ảnh mới thì ta cần phải dọn ảnh cũ trên cloudinary
      if (imageData.publicId && oldImage) {
        this.safeDeleteImage(oldImage);
      }
      this.log.log('Product updated', { userId, publicId });
      return updated;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'SERVER ERROR';

      // Nếu quá trình update sản phẩm gặp lỗi mà trước đó người dùng up ảnh mới thì cần phải dọn dẹp ảnh đã up trên cloudinary
      if (imageData.publicId) {
        this.safeDeleteImage(imageData.publicId);
      }
      this.log.warn('Product update', {
        status: LOG_STATUS.FAILED,
        reason: errorMessage,
        userId,
        product: publicId,
      });
      throw error;
    }
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────
  async remove(userId: string, publicId: string) {
    // Kiểm tra tồn tại & ownership
    const result = await this.findOneByPublicId(userId, publicId);
    if (result.imagePublicId) this.safeDeleteImage(result.imagePublicId);
    await this.prisma.product.delete({ where: { publicId } });

    this.log.log('Product deleted', { userId, publicId });
    return { message: 'Product deleted successfully.' };
  }
}
