import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { MetadataService } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('onboarding-init')
  @HttpCode(HttpStatus.OK)
  async getOnboardingInitData() {
    const [industries, taxGroups] = await Promise.all([
      this.metadataService.findAllIndustry(),
      this.metadataService.findAllTaxGroup(),
    ]);

    // Trả về một object duy nhất cho Frontend dễ map dữ liệu
    return {
      data: { industries, taxGroups },
    };
  }
}
