import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { Public } from '../common/decorators/public.decorator';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
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
}
