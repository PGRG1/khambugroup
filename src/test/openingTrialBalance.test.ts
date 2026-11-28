import { describe, expect, it } from 'vitest';
import { dayBefore, matchTbAccount, tbChecks, tbTotals, type TbAccount } from '@/utils/openingTrialBalance';

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

describe('opening assets against the trial balance', () => {
  it('checks cost per asset account and depreciation to date', () => {
    const acc: TbAccount[] = [{ id: 'k', code: '1510', name: 'Kitchen Equipment', account_type: 'asset' }, { id: 'ad', code: '1590', name: 'Accumulated Depreciation', account_type: 'asset' }];
    const lines = { k: { debit: 180000, credit: 0 }, ad: { debit: 0, credit: 70000 } };
    const checks = tbChecks(acc, lines, { owed: 0, credits: 0, customers: 0, deposits: 0, assets: { cost: { k: 180000 }, depreciated: { ad: 72000 } } });
    expect(checks.map(c => [c.label, c.ok])).toEqual([['Assets vs 1510 Kitchen Equipment', true], ['Depreciation to date vs 1590 Accumulated Depreciation', false]]);
  });
});

describe('matching printed trial balance lines', () => {
  const acc: TbAccount[] = [
    { id: 'bank', code: '1020', name: 'Bank — Operating', account_type: 'asset' },
    { id: 'ap', code: '2000', name: 'Accounts Payable', account_type: 'liability' },
    { id: 'dl', code: '2450', name: 'Director / Shareholder Loan', account_type: 'liability' },
  ];
  it('matches by name, by code with a shared word, and leaves the rest for the person', () => {
    expect(matchTbAccount({ code: '', name: 'Accounts payable' }, acc)).toBe('ap');
    expect(matchTbAccount({ code: '2450', name: 'Loan from director' }, acc)).toBe('dl');
    expect(matchTbAccount({ code: '2000', name: 'Sundry accruals' }, acc)).toBeNull();
    expect(matchTbAccount({ code: '', name: 'HSBC current account' }, acc)).toBeNull();
  });
});

describe('accountant wordings', () => {
  it('reads stock as inventory and trade creditors as accounts payable', () => {
    const acc: TbAccount[] = [{ id: 'f', code: '1200', name: 'Inventory — Food', account_type: 'asset' }, { id: 'ap', code: '2000', name: 'Accounts Payable', account_type: 'liability' }];
    expect(matchTbAccount({ code: '', name: 'Stock - food' }, acc)).toBe('f');
    expect(matchTbAccount({ code: '', name: 'Trade creditors' }, acc)).toBe('ap');
  });
});
