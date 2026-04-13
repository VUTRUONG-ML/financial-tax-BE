import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('tax-config')
  @HttpCode(HttpStatus.OK)
  async createOnboarding(
    @Body() dto: CreateOnboardingDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.onboardingService.setupTaxConfiguration(
      userId,
      dto,
    );
    return {
      message: 'User onboarding success',
      data: result,
    };
  }

  @Put('tax-config')
  @HttpCode(HttpStatus.OK)
  async updateOnboarding(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOnboardingDto,
  ) {
    const result = await this.onboardingService.updateTaxConfiguration(
      userId,
      dto,
    );
    return {
      message: 'Update onboarding success',
      data: result,
    };
  }
}
