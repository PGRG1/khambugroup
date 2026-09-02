/**
 * Signed accepted-amount math for invoice lines.
 *
 * A line may legitimately be negative (returned keg deposits, credits, refunds).
 * The accepted amount must therefore preserve sign and must equal the signed
 * invoiced amount exactly when acceptance is unchanged.
 */

/** Money comparison tolerance (half a cent). */
export const AMOUNT_EPSILON = 0.005;
/** Quantity comparison tolerance. */
export const QTY_EPSILON = 1e-9;

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseOptional = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface AcceptedAmountInput {
  /** Invoiced quantity (may be negative). */
  quantity: number | string | null | undefined;
  /** Invoiced unit price. */
  unitPrice: number | string | null | undefined;
  /** Signed invoiced line total, already rounded/discounted (may be an override). */
  invoicedTotal: number | string | null | undefined;
  /** Accepted quantity; blank/undefined means unchanged. */
  acceptedQty?: number | string | null;
  /** Accepted unit price; blank/undefined means unchanged. */
  acceptedPrice?: number | string | null;
}

/**
 * Signed accepted amount for a single line.
 *
 * - Unchanged acceptance → exactly the signed invoiced total (works for
 *   negative lines, flat credits and total_override lines).
 * - Otherwise scale by accepted qty × accepted price, sign preserved.
 */
export function computeAcceptedAmount(input: AcceptedAmountInput): number {
  const q = toNum(input.quantity);
  const invoiced = toNum(input.invoicedTotal);
  const invPrice = toNum(input.unitPrice);

  const acceptedQtyParsed = parseOptional(input.acceptedQty);
  const a = acceptedQtyParsed === null ? q : acceptedQtyParsed;

  const acceptedPriceParsed = parseOptional(input.acceptedPrice);
  const accPrice = acceptedPriceParsed === null ? invPrice : acceptedPriceParsed;

  const qtyUnchanged = Math.abs(a - q) <= QTY_EPSILON;
  const priceUnchanged = Math.abs(accPrice - invPrice) <= AMOUNT_EPSILON;

  // Unchanged acceptance always mirrors the invoiced amount, sign included.
  if (qtyUnchanged && priceUnchanged) return invoiced;

  const grossInv = invPrice * q;
  if (Math.abs(grossInv) > QTY_EPSILON) {
    return invoiced * ((accPrice * a) / grossInv);
  }
  if (Math.abs(q) > QTY_EPSILON) {
    return invoiced * (a / q);
  }
  // q === 0: a flat signed total (e.g. credit with total override) cannot be
  // scaled — keep the signed invoiced amount rather than collapsing to zero.
  return invoiced;
}

/** Display-safe money equality using a small tolerance. */
export function amountsEqual(a: number, b: number, tol = AMOUNT_EPSILON): boolean {
  return Math.abs(a - b) <= tol;
}
