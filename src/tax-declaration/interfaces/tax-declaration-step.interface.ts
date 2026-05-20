/**
 * Interfaces typed for each step's JSON data stored in TaxDeclarationDraft
 */

export interface Step1Data {
  taxCode: string;
  businessName: string;
  ownerName: string;
  cccdNumber: string;
  provinceCity: string;
}

export interface Step2Data {
  confirmedRevenue: number;
}

export interface InventoryItem {
  productPublicId: string;
  actualClosingQuantity: number;
}

// Step3Data is an array of inventory items
export type Step3Data = InventoryItem[];

export interface Step4Data {
  totalExpense: number;
}
