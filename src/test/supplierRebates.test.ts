import { describe, expect, it } from 'vitest';
import { dealLabel, dealLive, periodWindow, rangeLabel, rebateLabel, rebateProgress, type Rebate } from '@/utils/supplierRebates';

const r: Rebate = { id: 'r', supplier_id: 's', threshold: 100000, basis: 'percent', value: 2, period: 'quarterly', starts_on: '2026-01-01', ends_on: null, is_active: true };
describe('rebates', () => {
  it('finds the period', () => {
    expect(periodWindow(r, '2026-11-27')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodWindow({ period: 'monthly', starts_on: '2026-11-15' }, '2026-11-27')).toEqual({ from: '2026-11-15', to: '2026-11-30' });
    expect(periodWindow({ period: 'yearly', starts_on: '2025-01-01' }, '2026-03-02')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('uses From–To dates when there is no repeating period', () => {
    expect(periodWindow({ period: null, starts_on: '2026-01-01', ends_on: '2026-12-31' }, '2026-11-27')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('tracks spend and earning', () => {
    const spend = [{ supplier_id: 's', date: '2026-10-03', total: 60000 }, { supplier_id: 's', date: '2026-11-03', total: 50000 }, { supplier_id: 's', date: '2026-09-30', total: 999999 }, { supplier_id: 'x', date: '2026-11-01', total: 5 }];
    const p = rebateProgress(r, spend, new Set(['s']), '2026-11-27');
    expect(p.spent).toBe(110000); expect(p.earned).toBe(true); expect(p.amount).toBe(2200); expect(p.pct).toBe(110);
    const f = rebateProgress({ ...r, basis: 'fixed', value: 5000, threshold: 250000 }, spend, new Set(['s']), '2026-11-27');
    expect(f.earned).toBe(false); expect(f.amount).toBe(0);
  });
  it('labels', () => {
    expect(rebateLabel(r)).toBe('2% over HK$100k · quarterly');
    expect(rebateLabel({ basis: 'fixed', value: 5000, threshold: 250000, period: 'yearly' })).toBe('HK$5,000 over HK$250k · yearly');
    expect(rebateLabel({ basis: 'fixed', value: 5000, threshold: 250000, period: null, ends_on: '2026-12-31' })).toBe('HK$5,000 over HK$250k · to 31 Dec 2026');
    expect(rangeLabel('2026-01-01', '2026-12-31')).toBe('1 Jan – 31 Dec 2026');
    expect(rangeLabel('2026-12-01', '2027-01-31')).toBe('1 Dec 2026 – 31 Jan 2027');
    expect(dealLabel({ deal_type: 'buy_x_get_y_free', buy_qty: 2, free_qty: 1, valid_until: '2026-12-31', is_active: true })).toBe('Buy 2 get 1 · to 31 Dec');
    expect(dealLabel({ deal_type: 'discount', buy_qty: null, free_qty: null, discount_percent: 10, is_active: true }, 190)).toBe('10% off · HK$171');
    expect(dealLive({ deal_type: 'discount', buy_qty: null, free_qty: null, is_active: true, valid_until: '2026-11-01' }, '2026-11-27')).toBe(false);
  });
});
