import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxAuthorityConnectionsService } from './tax-authority-connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';

@Controller('tax-authority-connections')
@UseGuards(JwtAuthGuard)
export class TaxAuthorityConnectionsController {
  constructor(
    private readonly connectionsService: TaxAuthorityConnectionsService,
  ) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getConnection(@CurrentUser('id') userId: string) {
    const res = await this.connectionsService.getConnection(userId);
    return {
      message: 'Get tax connection initiated successfully.',
      data: res,
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async upsertConnection(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConnectionDto,
  ) {
    const res = await this.connectionsService.upsertConnection(userId, dto);
    return {
      message: 'Tax connection initiated successfully.',
      data: res,
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyConnection(@CurrentUser('id') userId: string) {
    const res = await this.connectionsService.verifyConnection(userId);
    return {
      message: 'Verification process initiated successfully.',
      data: res,
    };
  }
}
