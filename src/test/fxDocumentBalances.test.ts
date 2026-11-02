import { describe, expect, it } from 'vitest';
import { convertDocument, owedInCurrency } from '@/utils/fxDocument';

describe('documents keep their own currency', () => {
  it('a US$1,200 invoice at 7.8 stores HK$9,360 in base and returns the US$ originals', () => {
    const r = convertDocument({ currency: 'USD', total_amount: 1200, subtotal: 1200, tax_amount: 0 }, 'HKD', 7.8);
    expect(r.doc.total_amount).toBe(9360);
    expect(r.doc.original_total).toBe(1200);
    expect(r.original).toEqual({ total: 1200, subtotal: 1200, tax_amount: 0 });
    expect(r.factor).toBeCloseTo(7.8);
  });
  it('base-currency documents pass through with no originals', () => {
    const r = convertDocument({ currency: 'HKD', total_amount: 500 }, 'HKD', null);
    expect(r.original).toBeNull();
    expect(r.doc.original_total).toBeNull();
  });
  it('"Owed in currency" sums foreign items per currency and ignores base items', () => {
    expect(owedInCurrency([
      { currency: 'USD', owed_in_currency: 1000 },
      { currency: 'USD', owed_in_currency: 200 },
      { currency: 'HKD', owed_in_currency: 999 },
      { currency: null, owed_in_currency: null },
    ], 'HKD')).toBe('US$1,200.00');
  });
  it('an all-base list shows nothing extra', () => {
    expect(owedInCurrency([{ currency: 'HKD', owed_in_currency: null }], 'HKD')).toBe('');
  });
});
