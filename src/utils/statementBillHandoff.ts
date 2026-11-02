import type {ScannedBill} from '@/components/finance/bills/BillDropZone';
let pending: {scope: string; bill: ScannedBill} | null = null;
export function stageStatementBill(scope: string, bill: ScannedBill) { pending = {scope,bill}; }
export function takeStatementBill(scope: string) { const value = pending; pending = null; return value?.scope === scope ? value.bill : null; }