import { probablyMisreadDate } from './financeClose';

export type CorrectionLink = { original_entry_id: string; kind: string; line_id?: string | null; replacement_entry_id?: string | null; reversal_entry_id?: string | null };
export function unresolvedDateEntries<T extends { id: string; entry_date: string; status: string; source_type: string }>(entries: T[], links: CorrectionLink[], first: string | undefined, today: string) {
  const resolved = new Set(links.filter(l => l.kind === 'date' || l.kind === 'reverse').map(l => l.original_entry_id));
  return entries.filter(e => e.status === 'posted' && !resolved.has(e.id) && e.source_type !== 'adjustment' && probablyMisreadDate(e.entry_date, first, today));
}
export function unresolvedAccountLines<T extends { id: string; entry_id: string; mapping_status?: string | null; account_id?: string | null }>(lines: T[], links: CorrectionLink[], posted: Set<string>) {
  const resolved = new Set(links.filter(l => l.kind === 'account').map(l => l.line_id));
  const reversed = new Set(links.filter(l => ['date','reverse'].includes(l.kind)).map(l => l.original_entry_id));
  return lines.filter(l => posted.has(l.entry_id) && !reversed.has(l.entry_id) && !resolved.has(l.id) && (l.mapping_status === 'missing' || !l.account_id));
}
export function reclassificationPair(debit: number, credit: number, original: string, target: string) {
  if (!target || target === original) throw new Error('Choose a different account');
  if (debit < 0 || credit < 0 || !Number.isFinite(debit + credit) || debit + credit === 0) throw new Error('Invalid source amount');
  return [{ account_id: original, debit: credit, credit: debit }, { account_id: target, debit, credit }];
}
export function dateEvidence(record: Record<string, unknown> | undefined) {
  if (!record) return [];
  return ['received_date','uploaded_at','created_at'].flatMap(key => {
    const value = record[key];
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? [{ date: value.slice(0,10), reason: key === 'received_date' ? 'Received date' : key === 'uploaded_at' ? 'Upload date' : 'Record created date' }] : [];
  });
}
export const sourceLabel = (source: string) => ({ sales: 'from sales report', sales_summary: 'from sales summary', invoice: 'from supplier invoice', expense_bill: 'from bill or receipt', payroll_accrual: 'from payroll run', payroll_payment: 'from salary payment', bank_txn: 'matched bank line', bank_transaction: 'matched bank line', bank_fee: 'from bank fee', settlement_clearing: 'from card payout', settlement_fee: 'from card fees', petty_cash: 'from cash-box receipt', adjustment: 'correcting entry', manual: 'manual entry', opening: 'opening balance' }[source] ?? source.replace(/_/g, ' '));