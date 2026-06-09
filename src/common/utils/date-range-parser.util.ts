import { BadRequestException } from '@nestjs/common';
import { moment } from './time.util';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export function parseDateRange(
  timeFrame: string,
  customRange?: {
    year?: number;
    quarter?: number;
  },
): DateRange {
  const now = moment();
  let startDate: Date;
  let endDate: Date;

  switch (timeFrame) {
    case 'thang_nay':
      startDate = now.startOf('month').toDate();
      endDate = now.endOf('day').toDate();
      break;

    case 'thang_truoc': {
      const prevMonth = now.subtract(1, 'month');
      startDate = prevMonth.startOf('month').toDate();
      endDate = prevMonth.endOf('month').toDate();
      break;
    }

    case 'quy_nay':
      startDate = now.startOf('quarter').toDate();
      endDate = now.endOf('day').toDate();
      break;

    case 'custom': {
      if (!customRange || !customRange.year || !customRange.quarter) {
        throw new BadRequestException(
          'customRange with year and quarter is required when timeFrame is "custom".',
        );
      }
      const { year, quarter } = customRange;
      const startMonth = (quarter - 1) * 3;
      const qStart = moment().date(1).year(year).month(startMonth).startOf('month');
      const qEnd = qStart.add(2, 'month').endOf('month');
      startDate = qStart.startOf('day').toDate();
      endDate = qEnd.endOf('day').toDate();
      break;
    }

    default:
      throw new BadRequestException(`Unsupported timeFrame: ${timeFrame}`);
  }

  return { startDate, endDate };
}
