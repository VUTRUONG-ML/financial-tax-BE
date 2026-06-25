export const TAXPAYER_OPTIONS = {
  // Dành cho mẫu 01/TKN-CNKD (<= 1 tỷ)
  HKD_UNDER_1B: 'Hộ kinh doanh, cá nhân kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống',
  NEW_HKD_UNDER_1B: 'Hộ kinh doanh, cá nhân kinh doanh mới ra kinh doanh có doanh thu năm từ 01 tỷ đồng trở xuống',
  HKD_TAX_REFUND: 'Hộ kinh doanh, cá nhân kinh doanh nộp thuế TNCN theo phương pháp thuế suất nhân với doanh thu tính thuế để nghị hoàn thuế',
  INDIVIDUAL_AGENCY: 'Cá nhân trực tiếp ký hợp đồng làm đại lý xổ số, bảo hiểm, bán hàng đa cấp, hoạt động kinh doanh khác chưa khấu trừ, nộp thuế trong năm',
  ADJUST_PREVIOUS: 'Cho phép điều chỉnh, bổ sung các tờ khai Mẫu số 01/CNKD đã kê khai theo Thông tư số 40/2021/TT-BTC, Thông tư số 18/2026/TT-BTC; tờ khai Mẫu số 02/TMĐT đã kê khai theo Nghị định số 117/2025/NĐ-CP',

  // Dành cho mẫu 01/CNKD (> 1 tỷ)
  HKD_ON_REVENUE: 'Hộ kinh doanh, cá nhân kinh doanh thuộc đối tượng nộp thuế TNCN trên doanh thu tính thuế',
  HKD_ON_PROFIT: 'Hộ kinh doanh, cá nhân kinh doanh thuộc đối tượng nộp thuế TNCN trên thu nhập tính thuế',
  HKD_EC_PLATFORM: 'Hộ kinh doanh, cá nhân kinh doanh chỉ có hoạt động kinh doanh trên nền tảng thương mại điện tử, nền tảng số khác không có chức năng đặt hàng trực tuyến và chức năng thanh toán',
  HKD_OTHER_TAXES: 'Hộ kinh doanh, cá nhân kinh doanh khai các loại thuế khác (thuế TTĐB, thuế tài nguyên, thuế/phí bảo vệ môi trường)',
  HKD_EINVOICE_CODE: 'Trường hợp đề nghị cấp hóa đơn điện tử có mã của cơ quan thuế theo lần phát sinh',
};

export const TAX_PERIOD_OPTIONS = {
  YEAR: 'Năm',
  MONTH: 'Tháng',
  QUARTER: 'Quý',
  PER_OCCURRENCE: 'Lần phát sinh',
  FIRST_6_MONTHS: '6 tháng đầu năm',
  LAST_6_MONTHS: '6 tháng cuối năm',
};

export const DECLARATION_TYPE_OPTIONS = {
  FIRST_TIME: 'Tờ khai lần đầu',
  ADDITIONAL: 'Tờ khai bổ sung',
};
