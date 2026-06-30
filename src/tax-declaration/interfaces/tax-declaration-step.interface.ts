/**
 * Interfaces typed for each step's JSON data stored in TaxDeclarationDraft
 */

export type DeclarationFormType = '01_TKN_CNKD' | '01_CNKD' | '02_CNKD_TNCN_QTT';

export interface Step1Data {
  // 1. Kỳ tài chính / Kỳ kê khai (financialPeriodInfo)
  financialPeriodInfo: {
    periodName: string;         // Tên kỳ gốc, VD: "Năm 2026", "Quý 1/2026"
    vatFilingPeriod: string;    // Loại kỳ gốc, VD: "MONTHLY", "QUARTERLY", "YEARLY"
    declarationStartDate: Date; // startAt thực tế áp dụng cho tờ khai (co giãn theo tùy chọn)
    declarationEndDate: Date;   // endAt thực tế áp dụng cho tờ khai (co giãn theo tùy chọn)
    anchorStartDate: Date;      // Ngày bắt đầu của kỳ neo gốc
    anchorEndDate: Date;        // Ngày kết thúc của kỳ neo gốc
  };

  // 2. Thông tin người nộp thuế (taxpayerProfile)
  taxpayerProfile: {
    taxCode: string;            // Mã số thuế
    businessName: string;       // Tên hộ kinh doanh
    ownerName: string;          // Tên chủ hộ kinh doanh
    phone: string;              // Số điện thoại
    cccdNumber: string;         // Số CCCD
    address: string;            // Địa chỉ kinh doanh
    provinceCity: string;       // Tỉnh/Thành phố
    industry: string;           // Ngành nghề kinh doanh chính
  };

  // 3. Tùy chọn tờ khai quyết toán (declarationOptions)
  declarationOptions: {
    declarationFormType: DeclarationFormType;      // Loại biểu mẫu: "01_TKN_CNKD", "01_CNKD", "02_CNKD_TNCN_QTT"
    taxpayerOption: string;           // Tùy chọn người nộp thuế theo luật
    taxPeriodOption: string;          // Kỳ quyết toán do người dùng chọn: "Năm", "Tháng", "Quý", "6 tháng đầu năm", "6 tháng cuối năm"
    declarationTypeOption: string;    // Loại tờ khai: "Tờ khai lần đầu", "Tờ khai bổ sung"
    availablePeriodOptions: string[]; // Danh sách tùy chọn kỳ khả dụng sinh từ State Machine
  };

  // 4. Tổ chức/Cá nhân ủy quyền quyết toán (authorizedAgentInfo)
  authorizedAgentInfo: {
    authorizedFilerName: string;      // Tên tổ chức/cá nhân được ủy quyền
    authorizedFilerTaxCode: string;   // MST người được ủy quyền
    authorizedFilerDocNumber: string; // Số văn bản ủy quyền
    authorizedFilerDocDate: string | Date | null; // Ngày văn bản ủy quyền
    taxAgentName: string;             // Tên đại lý thuế (nếu có)
    taxAgentTaxCode: string;          // MST đại lý thuế (nếu có)
  };
}

export interface Step2Data {
  periodName: string;
  industries: {
    categoryName: string;
    vatRate: number;
    pitRate: number;
    revenue: number;
  }[];
  estimatedVat: number;
  transactionCount: number;
  confirmedRevenue: number;
}

export interface Step3Data {
  openingValue: number;
  importedValue: number;
  exportedValue: number;
  closingValue: number;
}

export interface Step4Data {
  totalExpense: number;
  chiPhiNguyenVatLieu: number; // ITEM_A
  chiPhiNhanCong: number;       // ITEM_B
  chiPhiKhauHao: number;        // ITEM_C
  chiPhiDichVuMuaNgoai: number; // ITEM_D
  chiPhiLaiVay: number;         // ITEM_E
  chiPhiKhac: number;           // ITEM_F
}
