import { SetMetadata } from '@nestjs/common';

export const CHECK_PERIOD_KEY = 'check_period';
export const CheckPeriod = () => SetMetadata(CHECK_PERIOD_KEY, true);
