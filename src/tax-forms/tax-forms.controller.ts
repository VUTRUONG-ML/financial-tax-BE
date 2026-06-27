import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxFormsService } from './tax-forms.service';
import { CreateTaxFormDto } from './dto/tax-form.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('tax-forms')
@UseGuards(JwtAuthGuard)
export class TaxFormsController {
  constructor(private readonly taxFormsService: TaxFormsService) {}

  // GET /tax-forms/bk-stk
  @Get('bk-stk')
  async getBkStk(@CurrentUser('id') userId: string) {
    const data = await this.taxFormsService.getBkStk(userId);
    return { message: 'BK-STK form data retrieved successfully.', data };
  }

  // POST /tax-forms
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async createTaxForm(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTaxFormDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data = await this.taxFormsService.createTaxForm(userId, dto, file);
    return { message: 'Tax form record created successfully.', data };
  }
}
