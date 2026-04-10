/**
 * Chuyển đổi chuỗi thời gian cơ bản sang GIÂY (Seconds)
 * Hỗ trợ: 's' (giây), 'm' (phút), 'h' (giờ), 'd' (ngày)
 */
export function parseTimeToSeconds(
  timeStr: string,
  fallback: string = '15m',
): number {
  const targetStr = timeStr || fallback;

  // Dùng Regex để tách số và đơn vị (VD: '7d' -> số 7, đơn vị 'd')
  const match = targetStr.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    // Nếu config sai định dạng, ném lỗi hoặc trả về fallback an toàn
    return 900; // Mặc định 15 phút (900 giây) nếu lỗi
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400; // 24 * 60 * 60
    default:
      return 900;
  }
}

/**
 * Chuyển đổi chuỗi thời gian cơ bản sang MILISECONDS (Dùng cho Date DB)
 */
export function parseTimeToMs(
  timeStr: string,
  fallback: string = '7d',
): number {
  return parseTimeToSeconds(timeStr, fallback) * 1000;
}
