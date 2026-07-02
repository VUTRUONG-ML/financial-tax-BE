import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getSummary(@CurrentUser('id') userId: string) {
    const data = await this.stocksService.getSummary(userId);
    return {
      message: 'Stock summary retrieved successfully',
      data,
    };
  }

  @Get('opening-summary/:periodPublicId')
  @HttpCode(HttpStatus.OK)
  async getOpeningSummary(
    @CurrentUser('id') userId: string,
    @Param('periodPublicId') publicId: string,
  ) {
    const data = await this.stocksService.getOpeningSummary(userId, publicId);
    return {
      message: 'Opening stock summary retrieved successfully',
      data,
    };
  }

  @Get('opening-list/:periodPublicId')
  @HttpCode(HttpStatus.OK)
  async getOpeningList(
    @CurrentUser('id') userId: string,
    @Param('periodPublicId') publicId: string,
  ) {
    const data = await this.stocksService.getOpeningList(userId, publicId);
    return {
      message: 'Opening stock list retrieved successfully',
      data,
    };
  }
}
