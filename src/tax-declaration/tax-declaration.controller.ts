import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TaxDeclarationService } from './tax-declaration.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';
import { StartSessionDto } from './dto/start-session.dto';
import { SaveStep1Dto } from './dto/save-step-1.dto';
import { SaveStep2Dto } from './dto/save-step-2.dto';
import { SaveStep3Dto } from './dto/save-step-3.dto';
import { SaveStep4Dto } from './dto/save-step-4.dto';
import { SubmitDeclarationDto } from './dto/submit-declaration.dto';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Tax Declaration')
@ApiBearerAuth()
@Controller('tax-declaration')
export class TaxDeclarationController {
  constructor(private readonly taxDeclarationService: TaxDeclarationService) {}

  @Get('init')
  @ApiOperation({ summary: 'Khởi tạo & Kiểm tra Kỳ (Pre-steps)' })
  async init(@CurrentUser() user: RequestUser) {
    return await this.taxDeclarationService.init(user.id);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bắt đầu Kê khai (Start Session)' })
  async startSession(
    @CurrentUser() user: RequestUser,
    @Body() dto: StartSessionDto,
  ) {
    return await this.taxDeclarationService.startSession(
      user.id,
      dto.periodIdPublicId,
    );
  }

  @Get('step-1/:publicId')
  @ApiOperation({ summary: 'Lấy dữ liệu Bước 1: Thông tin Hộ kinh doanh' })
  async getStep1(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
  ) {
    return await this.taxDeclarationService.getStep1(user.id, publicId);
  }

  @Post('step-1/save/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lưu dữ liệu Bước 1' })
  async saveStep1(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SaveStep1Dto,
  ) {
    return await this.taxDeclarationService.saveStep1(user.id, publicId, dto);
  }

  @Get('step-2/:publicId')
  @ApiOperation({ summary: 'Lấy dữ liệu Bước 2: Doanh thu chịu thuế' })
  async getStep2(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
  ) {
    return await this.taxDeclarationService.getStep2(user.id, publicId);
  }

  @Post('step-2/save/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lưu dữ liệu Bước 2' })
  async saveStep2(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SaveStep2Dto,
  ) {
    return await this.taxDeclarationService.saveStep2(user.id, publicId, dto);
  }

  @Get('step-3/:publicId')
  @ApiOperation({ summary: 'Lấy dữ liệu Bước 3: Tồn kho' })
  async getStep3(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
  ) {
    return await this.taxDeclarationService.getStep3(user.id, publicId);
  }

  @Post('step-3/save/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lưu dữ liệu Bước 3 (Có đánh chặn B2)' })
  async saveStep3(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SaveStep3Dto,
  ) {
    return await this.taxDeclarationService.saveStep3(user.id, publicId, dto);
  }

  @Get('step-4/:publicId')
  @ApiOperation({ summary: 'Lấy dữ liệu Bước 4: Chi phí' })
  async getStep4(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
  ) {
    return await this.taxDeclarationService.getStep4(user.id, publicId);
  }

  @Post('step-4/save/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lưu dữ liệu Bước 4 (Có đánh chặn B2, B3)' })
  async saveStep4(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SaveStep4Dto,
  ) {
    return await this.taxDeclarationService.saveStep4(user.id, publicId, dto);
  }

  @Get('step-5/preview/:publicId')
  @ApiOperation({ summary: 'Xem trước Tờ khai & Chọn PIT Method' })
  async getStep5Preview(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
  ) {
    return await this.taxDeclarationService.getStep5Preview(user.id, publicId);
  }

  @Post('submit/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kiểm tra & Ký nộp (Lượt bấm đầu tiên)' })
  async submit(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SubmitDeclarationDto,
  ) {
    return await this.taxDeclarationService.submit(user.id, publicId, dto);
  }

  @Post('submit-force/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cưỡng chế Đồng bộ & Nộp (Khi có biến động)' })
  async submitForce(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SubmitDeclarationDto,
  ) {
    return await this.taxDeclarationService.submitForce(user.id, publicId, dto);
  }

  @Post('submit-ignore-warning/:publicId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ qua Cảnh báo & Nộp số cũ (Audit Log)' })
  async submitIgnoreWarning(
    @CurrentUser() user: RequestUser,
    @Param('publicId') publicId: string,
    @Body() dto: SubmitDeclarationDto,
  ) {
    return await this.taxDeclarationService.submitIgnoreWarning(
      user.id,
      publicId,
      dto,
    );
  }
}
