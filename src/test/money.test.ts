// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatMoney, formatWithBase, currencyDecimals, baseAmount, setBaseCurrency } from '@/utils/money';
import { convertDocument } from '@/utils/fxDocument';

describe('ISO currency formatting', () => {
  it('uses ISO decimals', () => { expect(currencyDecimals('JPY')).toBe(0); expect(currencyDecimals('KWD')).toBe(3); expect(currencyDecimals('USD')).toBe(2); });
  it('formats HKD/USD/JPY/EUR/CNY', () => {
    expect(formatMoney(1234.5, 'HKD')).toBe('HK$1,234.50');
    expect(formatMoney(1200, 'USD')).toBe('US$1,200.00');
    expect(formatMoney(1200, 'JPY')).toBe('¥1,200');
    expect(formatMoney(-9.5, 'EUR')).toBe('-€9.50');
    expect(formatMoney(4373.92, 'CNY')).toBe('¥4,373.92');
  });
  it('shows original, base and rate for foreign documents', () => {
    setBaseCurrency('HKD');
    expect(formatWithBase(1200, 'USD', 7.783, '2026-10-28')).toBe('US$1,200.00 · HK$9,339.60 at 7.7830 (28 Oct)');
    expect(formatWithBase(50, 'HKD', null)).toBe('HK$50.00');
  });
});

describe('foreign document conversion', () => {
  it('base = original × rate and re-rating rescales from the original', () => {
    const first = convertDocument({ currency: 'USD', total_amount: 1200, subtotal: 1200, tax_amount: 0 }, 'HKD', 7.783);
    expect(first.doc.total_amount).toBe(9339.6); expect(first.doc.original_total).toBe(1200);
    const again = convertDocument(first.doc, 'HKD', 7.8);
    expect(again.doc.total_amount).toBe(9360); expect(again.doc.original_total).toBe(1200);
    expect(baseAmount(1000, 0.0512, 'HKD')).toBe(51.2);
  });
  it('never converts without a rate', () => { expect(() => convertDocument({ currency: 'USD', total_amount: 1 }, 'HKD', null)).toThrow(); });
});
