/**
 * Interfaces typed for each step's JSON data stored in TaxDeclarationDraft
 */

export type DeclarationFormType = '01_TKN_CNKD' | '01_CNKD' | '02_CNKD_TNCN_QTT';

export interface Step1Data {
  taxCode: string;
  businessName: string;
  ownerName: string;
  phone?: string;
  cccdNumber: string;
  industry?: string;
  address?: string;
  provinceCity: string;

  // Tùy chọn bổ sung tờ khai
  declarationFormType?: DeclarationFormType;
  taxpayerOption?: string;
  taxPeriodOption?: string;
  declarationTypeOption?: string;
  authorizedFilerName?: string;
  authorizedFilerTaxCode?: string;
  authorizedFilerDocNumber?: string;
  authorizedFilerDocDate?: string | null;
  taxAgentName?: string;
  taxAgentTaxCode?: string;
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
