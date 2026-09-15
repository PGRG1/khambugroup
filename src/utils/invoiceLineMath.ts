import { normalizeDiscountMode } from "@/utils/invoiceRounding";

/** Tolerance (HK$) below which a line-total difference is treated as reconciled. */
export const LINE_MATH_TOLERANCE = 0.05;

export type LineMathShape = {
  quantity?: string | number | null;
  unit_price?: string | number | null;
  tax_amount?: string | number | null;
  discount?: string | number | null;
  discount_mode?: string | null;
  discount_rate?: string | number | null;
  total?: string | number | null;
  review_warnings?: string[];
  review_blocking?: string[];
  [key: string]: unknown;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Expected line total = qty × price − discount + tax (discount may be fixed or %). */
export const expectedLineTotal = (line: LineMathShape): number => {
  const gross = num(line.quantity) * num(line.unit_price);
  const mode = normalizeDiscountMode(line.discount_mode as string | undefined);
  const disc =
    mode === "percentage"
      ? Math.max(0, (gross * Math.max(0, Math.min(100, num(line.discount_rate)))) / 100)
      : Math.max(0, num(line.discount));
  return gross - disc + num(line.tax_amount);
};

const parseFinite = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Options for reconciliation. When `actualTotal` is explicitly provided (even
 * undefined), it is treated as the ORIGINAL extracted total: a missing or
 * non-numeric value means the math can NOT be confirmed reconciled, so flags
 * are preserved rather than silently pruned.
 */
export type LineMathReconcileOptions = { actualTotal?: unknown };

/** True when the recomputed total matches the extracted total within tolerance. */
export const isLineMathReconciled = (
  line: LineMathShape,
  opts?: LineMathReconcileOptions
): boolean => {
  const expected = expectedLineTotal(line);
  if (opts && "actualTotal" in opts) {
    const actual = parseFinite(opts.actualTotal);
    if (actual === null) return false;
    return Math.abs(expected - actual) <= LINE_MATH_TOLERANCE + 1e-9;
  }
  return Math.abs(expected - num(line.total)) <= LINE_MATH_TOLERANCE + 1e-9;
};

/** Detects reviewer findings that describe a line-total arithmetic mismatch. */
export const isLineMathFlag = (msg: string): boolean => {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("total does not match") ||
    m.includes("total calculation mismatch") ||
    m.includes("line total") ||
    m.includes("does not equal") ||
    m.includes("qty × price") ||
    m.includes("quantity * price") ||
    m.startsWith("line_total") ||
    m.startsWith("total:")
  );
};

/**
 * Drop reviewer flags on a line that describe an arithmetic mismatch which the
 * structured numbers no longer support. Unrelated findings are preserved.
 */
export const pruneStaleLineMathFlags = <T extends LineMathShape>(
  line: T,
  opts?: LineMathReconcileOptions
): T => {
  if (!line) return line;
  if (!isLineMathReconciled(line, opts)) return line;
  const warnings = line.review_warnings || [];
  const blocking = line.review_blocking || [];
  const nextWarnings = warnings.filter((m) => !isLineMathFlag(m));
  const nextBlocking = blocking.filter((m) => !isLineMathFlag(m));
  if (nextWarnings.length === warnings.length && nextBlocking.length === blocking.length) return line;
  return { ...line, review_warnings: nextWarnings, review_blocking: nextBlocking };
};
