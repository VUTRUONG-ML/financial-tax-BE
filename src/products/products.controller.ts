import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageUploadPipe } from '../common/constants/file-upload.constants';
import { Throttle } from '@nestjs/throttler';
import { PeriodLockGuard } from '../common/guards/period-lock.guard';
import { CheckPeriod } from '../common/decorators/check-period.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard, PeriodLockGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // POST /products
  @Post()
  @CheckPeriod()
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProductDto,
    @UploadedFile(ImageUploadPipe) file: Express.Multer.File,
  ) {
    const data = await this.productsService.create(userId, dto, file);
    return { message: 'Product created successfully.', data };
  }

  // GET /products
  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    const result = await this.productsService.findAll(
      userId,
      pageNumber,
      limitNumber,
    );
    return { message: 'Products retrieved successfully.', ...result };
  }

  // GET /products/:publicId
  @Get(':publicId')
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const data = await this.productsService.findOneByPublicId(userId, publicId);
    return { message: 'Product retrieved successfully.', data };
  }

  // PUT /products/:publicId
  @Put(':publicId')
  @CheckPeriod()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile(ImageUploadPipe) file?: Express.Multer.File,
  ) {
    const data = await this.productsService.update(userId, publicId, dto, file);
    return { message: 'Product updated successfully.', data };
  }

  // DELETE /products/:publicId
  @Delete(':publicId')
  @CheckPeriod()
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const result = await this.productsService.remove(userId, publicId);
    return result;
  }
}
