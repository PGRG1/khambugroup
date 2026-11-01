import { monthlyDepreciation, stockAdjustment, type ScheduleSettings } from './financeSchedules';
import { splitCoverage } from './expenseAccruals';

export type DraftLine = { account: string; debit: number; credit: number };
export type ScheduleDraft = { status: 'waiting'; kind: string; date: string; lines: DraftLine[] };
const money = (n: number) => {
  if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100) throw new Error('Amount must be non-negative cents');
  return n;
};
function draft(kind: string, date: string, lines: DraftLine[], closed = false): ScheduleDraft {
  if (closed) throw new Error('Month is closed');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid date');
  const kept = lines.filter(l => l.debit || l.credit);
  kept.forEach(l => { money(l.debit); money(l.credit); if (!l.account || l.debit && l.credit) throw new Error('Invalid account line'); });
  const debit = Math.round(kept.reduce((n, l) => n + l.debit, 0) * 100);
  const credit = Math.round(kept.reduce((n, l) => n + l.credit, 0) * 100);
  if (debit <= 0 || debit !== credit) throw new Error('Draft must balance');
  return { status: 'waiting', kind, date, lines: kept };
}
const debit = (account: string, amount: number): DraftLine => ({ account, debit: amount, credit: 0 });
const credit = (account: string, amount: number): DraftLine => ({ account, debit: 0, credit: amount });
export function assetIntakeDraft(date: string, cost: number, accumulated: number, contra: string, closed = false) {
  money(cost); money(accumulated); if (accumulated > cost) throw new Error('Depreciation exceeds cost');
  return draft('asset_opening', date, [debit('1500', cost), credit('1550', accumulated), credit(contra, cost - accumulated)], closed);
}
export function capitalisationDraft(date: string, amount: number, expense: string, closed = false) {
  return draft('asset_reclassification', date, [debit('1500', money(amount)), credit(expense, amount)], closed);
}
export function equipmentCandidate(amount: number, description: string, limit = 5000) {
  return amount > limit && /equipment|fit[- ]?out|oven|freezer|fridge|furniture|computer|leasehold/i.test(description);
}
export function depreciationDraft(date: string, cost: number, life: number, accumulated: number, closed = false) {
  const amount = monthlyDepreciation(cost, 0, life, accumulated);
  return amount ? draft('depreciation', date, [debit('6900', amount), credit('1550', amount)], closed) : null;
}
export function disposalDraft(date: string, cost: number, accumulated: number, proceeds: number, receipt: string, closed = false) {
  money(cost); money(accumulated); money(proceeds); if (accumulated > cost) throw new Error('Depreciation exceeds cost');
  const difference = Math.round((cost - accumulated - proceeds) * 100) / 100;
  return draft('asset_disposal', date, [credit('1500', cost), debit('1550', accumulated), debit(receipt, proceeds), difference >= 0 ? debit('6990', difference) : credit('4990', -difference)], closed);
}
export function advanceBillPlan(amount: number, start: string, end: string, billDate: string, expense: string, closed = false) {
  money(amount);
  const shares = splitCoverage(amount, start, end).filter(p => p.month > billDate.slice(0, 7));
  const future = Math.round(shares.reduce((n, p) => n + p.amount, 0) * 100) / 100;
  return { funding: future ? draft('prepayment_funding', billDate, [debit('1320', future), credit(expense, future)], closed) : null,
    releases: shares.map(p => draft('prepayment_release', `${p.month}-01`, [debit(expense, p.amount), credit('1320', p.amount)], closed)) };
}
export function grniDraft(date: string, checked: boolean, postedInvoice: boolean, value: number, basis: ScheduleSettings['stock_basis'], purchaseAccount: string, closed = false) {
  if (!checked || postedInvoice) return null;
  return draft('grni', date, [debit(basis === 'counts' ? '1400' : purchaseAccount, money(value)), credit('2210', value)], closed);
}
export function grniReversal(date: string, original: ScheduleDraft, postedInvoice: boolean, closed = false) {
  return postedInvoice ? draft('grni_reversal', date, original.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })), closed) : null;
}
export function deferredDraft(date: string, balance: number, amount: number, action: 'sold' | 'used' | 'refund' | 'expiry', receipt: string, sales: string, closed = false) {
  money(amount); if (action !== 'sold' && amount > balance) throw new Error('Deferred balance unavailable');
  const lines = action === 'sold' ? [debit(receipt, amount), credit('2300', amount)] : [debit('2300', amount), credit(action === 'refund' ? receipt : action === 'expiry' ? '4900' : sales, amount)];
  return draft(`deferred_${action}`, date, lines, closed);
}
export function approvedStockDraft(date: string, approved: boolean, basis: ScheduleSettings['stock_basis'], value: number, previous: number, cost: string, closed = false) {
  if (!approved || basis !== 'counts') return null;
  money(value); money(previous); const change = stockAdjustment(basis, value, previous);
  return change ? draft('stock', date, change > 0 ? [debit('1400', change), credit(cost, change)] : [debit(cost, -change), credit('1400', -change)], closed) : null;
}