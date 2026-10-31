import type { ExpenseBill } from '@/hooks/useExpenseBills';

export const expenseTabs = [
  { label: 'Bills & receipts', path: '/expenses' },
  { label: 'Regular bills', path: '/expenses/recurring' },
  { label: 'Staff claims', path: '/expenses/claims' },
  { label: 'Trends', path: '/expenses/analytics' },
];
export const isWaitingBill = (b: Pick<ExpenseBill, 'approval_status'>) => ['draft', 'pending_review', 'approved'].includes(b.approval_status);
export function expenseStatus(b: Pick<ExpenseBill, 'approval_status' | 'payment_status' | 'meta'>): string {
  if (['void', 'reversed', 'rejected'].includes(b.approval_status)) return b.approval_status === 'void' ? 'Voided' : b.approval_status === 'reversed' ? 'Reversed' : 'Rejected';
  if (isWaitingBill(b)) return 'Waiting for you';
  if (b.payment_status === 'paid') return b.meta?.paid_from === 'petty_cash' ? 'Paid from cash box' : b.meta?.paid_from === 'staff' ? 'Paid by staff' : 'Paid';
  return 'Booked · to pay';
}
export const categoryAccountCodes: Record<string, string> = { Food: '5110', Beverages: '5100', Packaging: '5120', Cleaning: '6100', Equipment: '6110', Other: '6090' };
export function proposedCategoryAccount(name: string, accounts: { id: string; code: string }[]): string {
  return accounts.find(a => a.code === categoryAccountCodes[name])?.id ?? '';
}
export function similarVendors(vendors: { id: string; name: string }[]) {
  const normalize = (s: string) => s.toLowerCase().replace(/\b(limited|ltd|hong kong|company|co)\b/g, '').replace(/[^a-z0-9]/g, '');
  return vendors.flatMap((a, i) => vendors.slice(i + 1).filter(b => {
    const x = normalize(a.name), y = normalize(b.name);
    return x.length >= 3 && y.length >= 3 && (x === y || x.startsWith(y) || y.startsWith(x));
  }).map(b => ({ a, b })));
}
export function regularBillGroups(bills: ExpenseBill[]) {
  const groups = new Map<string, ExpenseBill[]>();
  for (const b of bills) {
    if (!b.supplier_id || ['void', 'reversed', 'rejected'].includes(b.approval_status)) continue;
    const key = `${b.supplier_id}|${b.venue_id ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.entries()].filter(([, rows]) => {
    const months = [...new Set(rows.map(b => b.bill_date.slice(0, 7)))].sort();
    if (months.length < 3) return false;
    const n = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
    return months.slice(1).every((m, i) => n(m) - n(months[i]) <= 2);
  }).map(([key, rows]) => ({ key, rows: rows.sort((a, b) => a.bill_date.localeCompare(b.bill_date)) }));
}
export function claimChecks(claim: { id?: string; claim_date: string; amount: number; description: string; receipt_path?: string | null; receipt_url?: string | null; receipt_hash?: string | null }, others: typeof claim[], today: string) {
  const reasons: string[] = [];
  if (!claim.receipt_path && !claim.receipt_url) reasons.push('No attached receipt — readability cannot be checked');
  if ((Date.parse(today) - Date.parse(claim.claim_date)) / 86400000 > 60) reasons.push('Older than 60 days');
  if (claim.amount > 300) reasons.push('Over HK$300 — owner approval required');
  if (others.some(o => o.id !== claim.id && ((!!claim.receipt_hash && o.receipt_hash === claim.receipt_hash) || (!!claim.receipt_path && o.receipt_path === claim.receipt_path) || (o.claim_date === claim.claim_date && o.amount === claim.amount && o.description.trim().toLowerCase() === claim.description.trim().toLowerCase())))) reasons.push('Possible duplicate receipt or same description, date and amount');
  return reasons;
}