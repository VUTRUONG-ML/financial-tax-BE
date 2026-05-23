import { BadRequestException } from '@nestjs/common';
import { moment } from './time.util';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export function parseDateRange(
  timeFrame: string,
  customRange?: { startDate: Date; endDate: Date },
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

    case 'nam_nay':
      startDate = now.startOf('year').toDate();
      endDate = now.endOf('day').toDate();
      break;

    case 'nam_truoc': {
      const prevYear = now.subtract(1, 'year');
      startDate = prevYear.startOf('year').toDate();
      endDate = prevYear.endOf('year').toDate();
      break;
    }

    case '7_ngay_qua':
      startDate = now.subtract(7, 'day').startOf('day').toDate();
      endDate = now.endOf('day').toDate();
      break;

    case '30_ngay_qua':
      startDate = now.subtract(30, 'day').startOf('day').toDate();
      endDate = now.endOf('day').toDate();
      break;

    case 'tuan_nay': {
      const day = now.day();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      startDate = now.add(diffToMonday, 'day').startOf('day').toDate();
      endDate = now.endOf('day').toDate();
      break;
    }

    case 'tuan_truoc': {
      const day = now.day();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const mondayThisWeek = now.add(diffToMonday, 'day');
      startDate = mondayThisWeek.subtract(7, 'day').startOf('day').toDate();
      endDate = mondayThisWeek.subtract(1, 'day').endOf('day').toDate();
      break;
    }

    case 'custom': {
      if (!customRange || !customRange.startDate || !customRange.endDate) {
        throw new BadRequestException(
          'customRange with startDate and endDate is required when timeFrame is "custom".',
        );
      }
      const start = moment(customRange.startDate);
      const end = moment(customRange.endDate);

      if (!start.isValid() || !end.isValid()) {
        throw new BadRequestException('Invalid date format in customRange.');
      }

      if (start.isAfter(end)) {
        throw new BadRequestException('startDate cannot be after endDate.');
      }

      startDate = start.startOf('day').toDate();
      endDate = end.endOf('day').toDate();
      break;
    }

    default:
      throw new BadRequestException(`Unsupported timeFrame: ${timeFrame}`);
  }

  return { startDate, endDate };
}
