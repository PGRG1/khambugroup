import { describe, expect, it } from 'vitest';
import { realisedFx, revalueFx, reverseFxLines } from '@/utils/fxAccounting';

describe('FX payment and close rules', () => {
  it('USD 1,200 booked at 7.7830 and paid at 7.8030 creates a 24.00 loss', () => {
    expect(realisedFx(1200, 7.783, 7.803, 'HKD')).toEqual({ carrying: 9339.6, cash: 9363.6, loss: 24 });
  });
  it('a half payment releases half the carrying amount and FX difference', () => {
    expect(realisedFx(600, 7.783, 7.803, 'HKD')).toEqual({ carrying: 4669.8, cash: 4681.8, loss: 12 });
  });
  it('an open foreign liability increases by the closing-rate loss', () => {
    expect(revalueFx(1200, 9339.6, 7.8, true, 'HKD')).toEqual({ baseNow: 9360, movement: 20.4, loss: 20.4 });
  });
  it('an asset rate increase is a gain, not a liability loss', () => {
    expect(revalueFx(4373.92, 5000, 1.17929023, false, 'HKD')).toEqual({ baseNow: 5158.12, movement: 158.12, loss: -158.12 });
  });
  it('next-month reversal swaps every debit and credit and balances', () => {
    const lines = [{ account_id: 'bank', debit: 158.12, credit: 0 }, { account_id: 'fx', debit: 0, credit: 158.12 }];
    const reversed = reverseFxLines(lines);
    expect(reversed).toEqual([{ account_id: 'bank', debit: 0, credit: 158.12 }, { account_id: 'fx', debit: 158.12, credit: 0 }]);
    expect(reversed.reduce((n,l) => n+l.debit-l.credit,0)).toBe(0);
  });
});