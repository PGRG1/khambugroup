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

// ============================================================================
// Discount system: % and $ at both line and header level.
// Header discount is distributed proportionally across lines so each line
// carries a `net_unit_cost` used downstream (GRN, inventory valuation).
// ============================================================================

export type DiscountMode = "fixed" | "percentage";

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeDiscountMode = (v: unknown): DiscountMode =>
  v === "percentage" ? "percentage" : "fixed";

/** $ discount for one line. `fixed` uses the explicit $ amount, `percentage` uses rate × gross. */
export function calcLineDiscount(
  lineGross: number,
  mode: DiscountMode,
  rate: number,
  fixed: number,
): number {
  if (mode === "percentage") {
    const r = Math.max(0, Math.min(100, toNum(rate)));
    return round2((toNum(lineGross) * r) / 100);
  }
  return round2(Math.max(0, toNum(fixed)));
}

/** $ header discount given the post-line-discount subtotal. */
export function calcHeaderDiscount(
  subtotal: number,
  mode: DiscountMode,
  rate: number,
  fixed: number,
): number {
  if (mode === "percentage") {
    const r = Math.max(0, Math.min(100, toNum(rate)));
    return round2((toNum(subtotal) * r) / 100);
  }
  return round2(Math.max(0, toNum(fixed)));
}

/**
 * Distribute a header discount across lines proportionally to each line's net.
 * Last non-zero line absorbs the rounding remainder so shares sum to headerAmount.
 *
 * Edge case: empty lines, zero total, or zero header → all zeros (no division).
 */
export function distributeHeaderDiscount(
  lineNets: number[],
  headerAmount: number,
): number[] {
  const n = lineNets.length;
  const header = round2(toNum(headerAmount));
  const shares = new Array<number>(n).fill(0);
  if (n === 0 || header === 0) return shares;

  const total = lineNets.reduce((s, v) => s + Math.max(0, toNum(v)), 0);
  if (total <= 0) return shares; // guards divide-by-zero (e.g. all lines have 100% line discount)

  let running = 0;
  let lastIdx = -1;
  for (let i = 0; i < n; i++) {
    const net = Math.max(0, toNum(lineNets[i]));
    if (net <= 0) continue;
    const share = round2((net / total) * header);
    shares[i] = share;
    running = round2(running + share);
    lastIdx = i;
  }
  if (lastIdx >= 0 && running !== header) {
    shares[lastIdx] = round2(shares[lastIdx] + (header - running));
  }
  return shares;
}

/** Per-unit net cost after line discount and allocated header share. 4dp. */
export function calcNetUnitCost(
  qty: number,
  unitPrice: number,
  lineDiscount: number,
  headerShare: number,
): number {
  const q = toNum(qty);
  const up = toNum(unitPrice);
  if (q <= 0) return round4(up);
  const lineNet = q * up - toNum(lineDiscount) - toNum(headerShare);
  return round4(lineNet / q);
}

export interface DiscountLineInput {
  quantity: number | string;
  unit_price: number | string;
  discount_mode?: DiscountMode;
  discount_rate?: number | string;
  discount?: number | string; // fixed $ amount on the line
}

export interface DiscountLineOutput {
  line_discount_amount: number;
  header_discount_share: number;
  net_unit_cost: number;
  /** Rounded line total per supplier rule: (qty × price) − line_discount − header_share. */
  total: string;
}

/**
 * Centralized recalculation used by both InvoiceScanner and the edit view.
 */
export function recalcAllDiscounts<T extends DiscountLineInput>(
  lines: T[],
  headerMode: DiscountMode,
  headerRate: number | string,
  headerFixed: number | string,
  roundingMode: RoundingMode,
): {
  perLine: DiscountLineOutput[];
  headerDiscountAmount: number;
  subtotalNet: number;
  totalLineDiscount: number;
} {
  const lineGross = lines.map((l) => toNum(l.quantity) * toNum(l.unit_price));
  const lineDiscounts = lines.map((l, i) =>
    calcLineDiscount(
      lineGross[i],
      normalizeDiscountMode(l.discount_mode),
      toNum(l.discount_rate),
      toNum(l.discount),
    ),
  );
  const lineNets = lineGross.map((g, i) => Math.max(0, round2(g - lineDiscounts[i])));

  const subtotalAfterLine = round2(lineNets.reduce((s, v) => s + v, 0));
  const headerAmt = calcHeaderDiscount(
    subtotalAfterLine,
    headerMode,
    toNum(headerRate),
    toNum(headerFixed),
  );
  const shares = distributeHeaderDiscount(lineNets, headerAmt);

  const perLine: DiscountLineOutput[] = lines.map((l, i) => {
    const qty = toNum(l.quantity);
    const ld = lineDiscounts[i];
    const hs = shares[i];
    const total = formatLineTotal(lineGross[i] - ld - hs, roundingMode);
    return {
      line_discount_amount: ld,
      header_discount_share: hs,
      net_unit_cost: calcNetUnitCost(qty, toNum(l.unit_price), ld, hs),
      total,
    };
  });

  return {
    perLine,
    headerDiscountAmount: headerAmt,
    subtotalNet: round2(subtotalAfterLine - headerAmt),
    totalLineDiscount: round2(lineDiscounts.reduce((s, v) => s + v, 0)),
  };
}
