// Per-supplier invoice rounding rules.
//
// Each supplier declares how invoice math is rounded on the
// Suppliers & Vendors page (`suppliers.invoice_rounding_mode`):
//
//   sum_then_round  – default. Sum raw line values; round invoice total to 2dp.
//   round_then_sum  – Round each line to 2dp first, then sum (e.g. VegFresh).
//   integer         – Round each line and the invoice total to whole numbers
//                     (e.g. Beverage World).

export type RoundingMode = "sum_then_round" | "round_then_sum" | "integer";

export const ROUNDING_MODE_LABELS: Record<RoundingMode, string> = {
  sum_then_round: "Sum then round (2 dp)",
  round_then_sum: "Round each line, then sum (2 dp)",
  integer: "Whole numbers (no decimals)",
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface SupplierLike {
  name?: string | null;
  invoice_rounding_mode?: string | null;
}

/** Resolve the rounding mode for a supplier (object or just its name). */
export function getRoundingMode(
  supplier?: SupplierLike | null,
  fallbackName?: string | null,
): RoundingMode {
  const explicit = supplier?.invoice_rounding_mode;
  if (explicit === "round_then_sum" || explicit === "integer" || explicit === "sum_then_round") {
    return explicit;
  }
  // Legacy name-based fallback for callers that only have a supplier name string.
  const name = (supplier?.name ?? fallbackName ?? "").toLowerCase();
  if (name.includes("beverage world")) return "integer";
  if (name.includes("vegfresh")) return "round_then_sum";
  return "sum_then_round";
}

/** Round one line item total according to the supplier's rule. */
export function roundLineTotal(raw: number, mode: RoundingMode): number {
  if (mode === "integer") return Math.round(raw);
  // Both sum_then_round and round_then_sum show line totals at 2dp.
  return round2(raw);
}

/** Format a line total as a string (matches scanner/edit input behavior). */
export function formatLineTotal(raw: number, mode: RoundingMode): string {
  if (mode === "integer") return String(Math.round(raw));
  return round2(raw).toFixed(2);
}

/**
 * Aggregate an invoice total from raw per-line values.
 *
 *   sum_then_round → round(Σ raw, 2dp)
 *   round_then_sum → Σ round(raw, 2dp)
 *   integer        → Σ round(raw)
 */
export function aggregateTotal(rawValues: number[], mode: RoundingMode): number {
  if (mode === "round_then_sum") {
    return round2(rawValues.reduce((s, v) => s + round2(v), 0));
  }
  if (mode === "integer") {
    return rawValues.reduce((s, v) => s + Math.round(v), 0);
  }
  return round2(rawValues.reduce((s, v) => s + v, 0));
}
