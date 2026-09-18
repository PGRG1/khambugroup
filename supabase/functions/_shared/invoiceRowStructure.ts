/**
 * Deterministic invoice row-structure / total validation.
 *
 * Pure: no IO, no globals. Used by the parse-invoice edge function (before and
 * after an Agent 2 line replacement) and by focused tests.
 *
 * Zero-amount product rows are REAL rows — a free keg line still counts as a
 * monetary row and must never be pruned to make a total reconcile.
 */

export const RECONCILE_TOLERANCE = 0.5; // HK$

export interface StructureLine {
  description?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
  printed_amount?: number | string | null;
  source_line_no?: string | null;
  /** false for synthetic rows (e.g. forced returned-keg deposit refunds) that are
   *  not printed in the AMOUNT column and therefore excluded from reconciliation. */
  counts_toward_total?: boolean;
}

export interface StructureValidation {
  lineCount: number;
  printedSum: number;
  headerTotal: number | null;
  difference: number | null;
  reconciles: boolean;
  blocking: boolean;
  message: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The amount printed in the AMOUNT / line-total column for a row. */
export function printedAmountOf(line: StructureLine): number {
  if (line.printed_amount !== undefined && line.printed_amount !== null && line.printed_amount !== "") {
    return num(line.printed_amount);
  }
  return num(line.total);
}

/** Rows printed in the AMOUNT column — synthetic rows are excluded. */
export function monetaryLines(lines: StructureLine[]): StructureLine[] {
  return (lines || []).filter((l) => l.counts_toward_total !== false);
}

export function sumPrintedAmounts(lines: StructureLine[]): number {
  return round2(monetaryLines(lines).reduce((sum, l) => sum + printedAmountOf(l), 0));
}

/**
 * Validate that the printed line amounts reconcile against the header total.
 * A difference greater than the tolerance is a blocking structure/total problem.
 */
export function validateInvoiceStructure(
  lines: StructureLine[],
  headerTotal: number | null | undefined,
  opts: { tolerance?: number } = {},
): StructureValidation {
  const tolerance = opts.tolerance ?? RECONCILE_TOLERANCE;
  const list = lines || [];
  const printedSum = sumPrintedAmounts(list);
  const counted = monetaryLines(list);
  const header = headerTotal === null || headerTotal === undefined || headerTotal === ("" as unknown)
    ? null
    : num(headerTotal);

  if (list.length === 0) {
    return {
      lineCount: 0,
      printedSum: 0,
      headerTotal: header,
      difference: null,
      reconciles: false,
      blocking: true,
      message: "No line items were extracted from this invoice.",
    };
  }

  if (header === null) {
    return {
      lineCount: counted.length,
      printedSum,
      headerTotal: null,
      difference: null,
      reconciles: false,
      blocking: false,
      message: null,
    };
  }

  const difference = round2(printedSum - header);
  const reconciles = Math.abs(difference) <= tolerance;
  return {
    lineCount: counted.length,
    printedSum,
    headerTotal: header,
    difference,
    reconciles,
    blocking: !reconciles,
    message: reconciles
      ? null
      : `Printed line amounts total ${printedSum.toFixed(2)} but the invoice header total is ${header.toFixed(2)} (difference ${difference.toFixed(2)}). Row structure may be merged or a monetary row is missing.`,
  };
}

/**
 * Should an Agent 2 line replacement be applied?
 * Only at high confidence AND only when deterministic reconciliation improves
 * (or a structurally invalid extraction becomes valid). Never make things worse.
 */
export function shouldApplyLineReplacement(args: {
  confidence: number;
  headerTotal: number | null | undefined;
  currentLines: StructureLine[];
  replacementLines: StructureLine[];
  minConfidence?: number;
  tolerance?: number;
}): { apply: boolean; reason: string } {
  const minConfidence = args.minConfidence ?? 0.85;
  const replacement = args.replacementLines || [];
  if (!(args.confidence >= minConfidence)) {
    return { apply: false, reason: "confidence below threshold" };
  }
  if (replacement.length === 0) {
    return { apply: false, reason: "empty replacement" };
  }
  const before = validateInvoiceStructure(args.currentLines, args.headerTotal, { tolerance: args.tolerance });
  const after = validateInvoiceStructure(replacement, args.headerTotal, { tolerance: args.tolerance });

  if (before.lineCount === 0) return { apply: true, reason: "original extraction had no rows" };
  if (args.headerTotal === null || args.headerTotal === undefined) {
    return { apply: false, reason: "no header total to reconcile against" };
  }
  if (after.reconciles && !before.reconciles) {
    return { apply: true, reason: "replacement reconciles with the header total" };
  }
  const beforeDiff = Math.abs(before.difference ?? Number.POSITIVE_INFINITY);
  const afterDiff = Math.abs(after.difference ?? Number.POSITIVE_INFINITY);
  if (afterDiff + 0.001 < beforeDiff) {
    return { apply: true, reason: "replacement reconciles more closely" };
  }
  return { apply: false, reason: "replacement does not improve reconciliation" };
}
