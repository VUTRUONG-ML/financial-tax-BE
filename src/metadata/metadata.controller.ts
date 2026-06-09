import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('onboarding-init')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getOnboardingInitData() {
    const [industries, taxGroups, uiPopular] = await Promise.all([
      this.metadataService.findAllIndustry(),
      this.metadataService.findAllTaxGroup(),
      this.metadataService.findAllUiPopular(),
    ]);

    // Trả về một object duy nhất cho Frontend dễ map dữ liệu
    return {
      data: { industries, taxGroups, uiPopular },
    };
  }
}
