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
    return await this.connectionsService.getConnection(userId);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async upsertConnection(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConnectionDto,
  ) {
    return await this.connectionsService.upsertConnection(userId, dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyConnection(@CurrentUser('id') userId: string) {
    return {
      message: 'Verification process initiated successfully.',
      status: 'PENDING_VERIFY',
    };
  }
}
