import { describe, expect, it } from 'vitest';
import { dayBefore, tbChecks, tbTotals, type TbAccount } from '@/utils/openingTrialBalance';

const accounts: TbAccount[] = [
  { id: 'bank', code: '1020', name: 'Bank — Operating', account_type: 'asset' },
  { id: 'ar', code: '1100', name: 'Accounts Receivable', account_type: 'asset' },
  { id: 'dep', code: '1300', name: 'Supplier Deposits', account_type: 'asset' },
  { id: 'ap', code: '2000', name: 'Accounts Payable', account_type: 'liability' },
];

describe('opening trial balance', () => {
  it('takes the day before the books start', () => {
    expect(dayBefore('2026-12-01')).toBe('2026-11-30');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });
  it('totals and shows the difference for Opening Balance Equity', () => {
    expect(tbTotals({ bank: { debit: 165000, credit: 0 }, ap: { debit: 0, credit: 138000 } })).toEqual({ debit: 165000, credit: 138000, difference: 27000 });
  });
  it('checks supplier, customer and deposit detail against their lines', () => {
    const lines = { ap: { debit: 0, credit: 38000 }, ar: { debit: 500, credit: 0 } };
    const checks = tbChecks(accounts, lines, { owed: 40000, credits: 2000, customers: 700, deposits: 0 });
    expect(checks.map(c => [c.label.split(' vs')[0], c.ok])).toEqual([['Suppliers', true], ['Customers', false]]);
  });
});
