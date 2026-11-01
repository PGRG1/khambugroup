import type { SalesRecord } from '@/types/sales';
import type { ScheduleSettings } from './financeSchedules';
export const deferredSalesFields = [
  ['vouchersSold', 'Vouchers sold', 'voucher_enabled'],
  ['depositsTaken', 'Deposits taken', 'deposit_enabled'],
  ['vouchersUsed', 'Vouchers used', 'voucher_enabled'],
  ['depositsUsed', 'Deposits used', 'deposit_enabled'],
] as const;
export function enabledDeferredFields(settings: ScheduleSettings) { return deferredSalesFields.filter(([, , enabled]) => settings[enabled]); }
export function deferredSalesAmounts(record: Partial<SalesRecord>) {
  const values = deferredSalesFields.map(([key]) => Number(record[key] ?? 0));
  if (values.some(n => !Number.isFinite(n) || n < 0 || Math.abs(Math.round(n * 100) - n * 100) > 0.000001)) throw new Error('Deferred amounts must be non-negative cents');
  return { sold: values[0] + values[1], used: values[2] + values[3], revenueAdjustment: values[2] + values[3] - values[0] - values[1] };
}