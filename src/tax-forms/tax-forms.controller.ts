import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxFormsService } from './tax-forms.service';

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
}
