export interface InventoryBookRowRaw {
  sort_order: number;

  id: number | null;

  document_no: string | null;

  description: string;

  movement_date: Date | null;

  row_type: 'OPENING_BALANCE' | 'MOVEMENT';

  movement_type: string | null;

  unit_cost: number | string | null;

  receipt_quantity: number | string;
  receipt_value: number | string;

  issue_quantity: number | string;
  issue_value: number | string;

  running_stock: number | string;
  running_value: number | string;
}
