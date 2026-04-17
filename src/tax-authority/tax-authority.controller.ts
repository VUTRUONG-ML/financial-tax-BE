import { Controller } from '@nestjs/common';
import { TaxAuthorityService } from './tax-authority.service';

@Controller('tax-authority')
export class TaxAuthorityController {
  constructor(private readonly taxAuthorityService: TaxAuthorityService) {}
}
