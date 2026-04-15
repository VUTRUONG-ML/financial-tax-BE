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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageUploadPipe } from '../common/constants/file-upload.constants';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // POST /products
  @Post()
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
  async findAll(@CurrentUser('id') userId: string) {
    const data = await this.productsService.findAll(userId);
    return { message: 'Products retrieved successfully.', data };
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
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
    @Body() dto: UpdateProductDto,
  ) {
    const data = await this.productsService.update(userId, publicId, dto);
    return { message: 'Product updated successfully.', data };
  }

  // DELETE /products/:publicId
  @Delete(':publicId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('publicId') publicId: string,
  ) {
    const result = await this.productsService.remove(userId, publicId);
    return result;
  }
}
