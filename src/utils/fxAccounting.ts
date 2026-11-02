import { baseAmount } from './money';

/** Positive = loss for a liability; partial settlement uses only the paid foreign units. */
export function realisedFx(originalPaid: number, bookedRate: number, paidRate: number, base: string) {
  if (![originalPaid, bookedRate, paidRate].every(Number.isFinite) || originalPaid <= 0 || bookedRate <= 0 || paidRate <= 0) throw new Error('Enter positive original amount and rates');
  const carrying = baseAmount(originalPaid, bookedRate, base), cash = baseAmount(originalPaid, paidRate, base);
  return { carrying, cash, loss: baseAmount(cash - carrying, 1, base) };
}

export function revalueFx(original: number, carrying: number, closingRate: number, liability: boolean, base: string) {
  if (![original, carrying, closingRate].every(Number.isFinite) || closingRate <= 0) throw new Error('A month-end rate is required');
  const baseNow = baseAmount(original, closingRate, base), movement = baseAmount(baseNow - carrying, 1, base);
  return { baseNow, movement, loss: liability ? movement : -movement };
}

export function reverseFxLines(lines: { account_id: string; debit: number; credit: number }[]) {
  return lines.map(l => ({ ...l, debit: l.credit, credit: l.debit }));
}