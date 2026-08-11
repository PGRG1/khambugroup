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
