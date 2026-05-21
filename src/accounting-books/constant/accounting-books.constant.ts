export const ACCOUNTING_BOOKS_CONFIG = {
  // 1. Phân hệ Sổ Doanh Thu (Rẽ nhánh động theo tax_group)
  S1A: {
    code: 'S1a-HKD',
    title: 'SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ',
    template: 'S1a_TEMPLATE_MIEN_THUE',
  },
  S2A: {
    code: 'S2a-HKD',
    title: 'SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ',
    template: 'S2a_TEMPLATE_TONG_HOP_TNCN',
  },
  S2B: {
    code: 'S2b-HKD',
    title: 'SỔ CHI TIẾT DOANH THU BÁN HÀNG HÓA, DỊCH VỤ',
    template: 'S2b_TEMPLATE_TRACH_NHIEM_GTGT',
  },

  // 2. Phân hệ Sổ Chi Phí (Module B1 & B2)
  S2C: {
    code: 'S2c-HKD',
    title: 'SỔ CHI TIẾT CHI PHÍ SẢN XUẤT, KINH DOANH',
    template: 'S2c_TEMPLATE_PHAN_BO_COT',
  },

  // 3. Phân hệ Sổ Kho Tồn Kho (Module B3 Lệnh sản xuất & C3 Hóa đơn đầu vào)
  S2D: {
    code: 'S2d-HKD',
    title: 'SỔ CHI TIẾT VẬT TƯ, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA',
    template: 'S2d_TEMPLATE_NHAP_XUAT_TON',
  },

  // 4. Phân hệ Sổ Quỹ Tiền (Module B1 Tiền mặt & Tiền gửi)
  S2E: {
    code: 'S2e-HKD',
    title: 'SỔ CHI TIẾT TIỀN',
    template: 'S2e_TEMPLATE_RUNNING_BALANCE',
  },
} as const;

// Tạo Type từ Constant để phục vụ Type-Checking chặt chẽ ở tầng Service
export type AccountingBookKey = keyof typeof ACCOUNTING_BOOKS_CONFIG;