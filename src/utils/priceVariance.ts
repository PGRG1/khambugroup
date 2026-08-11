/**
 * Shared price-variance threshold.
 *
 * This is the same epsilon the invoice line items table has always used when
 * flagging a scanned price against the Items Master price. It lives here so the
 * table and the price history panel stay in lockstep — do not introduce a
 * second threshold.
 */
export const PRICE_VARIANCE_EPSILON = 0.01;

/** True when two prices differ by more than the shared threshold. */
export function priceVaries(a: number, b: number): boolean {
  return Math.abs(a - b) > PRICE_VARIANCE_EPSILON;
}

/**
 * Material price movement, expressed as a percentage. Used for period-on-period
 * comparisons (price history Δ column, "Change vs last") where any non-zero
 * cent difference is noise rather than a signal.
 */
export const PRICE_VARIANCE_PCT = 7;

/** Percentage change from `from` to `to`, or null when there is no baseline. */
export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0) return null;
  return ((to - from) / from) * 100;
}

/** True when the move from `from` to `to` exceeds the material percentage threshold. */
export function pctVaries(from: number, to: number): boolean {
  const pct = pctChange(from, to);
  return pct != null && Math.abs(pct) > PRICE_VARIANCE_PCT;
}
