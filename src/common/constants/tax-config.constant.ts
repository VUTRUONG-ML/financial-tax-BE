import { moment } from '../utils/time.util';

export const MAX_EFFECTIVE_DATE: Date = moment(
  '9999-12-31T23:59:59.999Z',
).toDate();
