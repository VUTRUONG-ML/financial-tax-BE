/**
 * Sinh ký hiệu hóa đơn bán hàng theo pháp lý Việt Nam.
 *
 * Quy tắc: Bắt buộc bắt đầu bằng số "2" (hóa đơn bán hàng).
 * Format: 2C{YY}{Random 3 chữ cái hoa}
 * Ví dụ:  2C26TAA, 2C26XBK
 *
 * Ref: Nghị định 123/2020/NĐ-CP, Thông tư 78/2021/TT-BTC
 */
export function generateInvoiceSymbol(): string {
  const year = new Date().getFullYear().toString().slice(-2); // "26"
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const random = Array.from(
    { length: 3 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');

  return `2C${year}${random}`; // VD: 2C26TAA
}
