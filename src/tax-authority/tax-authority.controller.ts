import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TaxAuthorityService } from './tax-authority.service';
import { Public } from 'src/common/decorators/public.decorator';
import { VerifyMockTaxAccountDto } from './dto/verify-mock-tax-account.dto';

@Controller('mock-tax-authority')
export class TaxAuthorityController {
  constructor(private readonly taxAuthorityService: TaxAuthorityService) {}

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyMockTaxAccountDto) {
    return this.taxAuthorityService.verifyAccount(dto);
  }
}
