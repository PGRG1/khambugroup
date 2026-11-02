import { describe, it, expect } from 'vitest';
import { matchPocket, statementGroupLabel } from '@/utils/statementPockets';
const accts = [{ id: 'hkd', account_number_last4: '1234', currency: 'HKD' }, { id: 'usd', account_number_last4: '1234', currency: 'USD' }];
describe('statement pockets', () => {
  it('assigns HKD and USD pockets with the same number to the right accounts', () => {
    expect(matchPocket(accts, { account_number_last4: '1234', currency: 'HKD' }, 'HKD')).toBe('hkd');
    expect(matchPocket(accts, { account_number_last4: '1234', currency: 'USD' }, 'HKD')).toBe('usd');
  });
  it('asks when no account has that currency, even with a saved mapping', () => {
    expect(matchPocket(accts, { account_number_last4: '1234', currency: 'CNY' }, 'HKD', 'hkd')).toBeNull();
  });
  it('labels the group by bank and main account number', () => {
    expect(statementGroupLabel('BOCHK', [{ account_number: '012-345-6-789012' }, { account_number: '' }])).toBe('BOCHK 012-345-6-789012');
  });
});
