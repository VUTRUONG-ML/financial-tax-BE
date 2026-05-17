import { Controller, Get, UseGuards, HttpStatus } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/interface/request-user.interface';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: RequestUser) {
    const data = await this.dashboardService.getSummary(user.id);
    return {
      success: true,
      message: 'Retrieve dashboard summary successfully',
      data,
    };
  }
}
