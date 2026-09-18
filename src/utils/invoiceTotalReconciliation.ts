/**
 * Printed (header) vs calculated invoice total reconciliation.
 *
 * Pure helpers shared by the scanner UI and its save gate so the same rule
 * decides what the user sees and what blocks a save.
 */

export const TOTAL_TOLERANCE = 0.5; // HK$

export interface ReconcilableLine {
  quantity?: string | number | null;
  unit_price?: string | number | null;
  discount?: string | number | null;
  tax_amount?: string | number | null;
  total?: string | number | null;
  total_override?: boolean;
  printed_amount?: string | number | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Working value of a line: a manual total override wins, else qty × price − discount + tax. */
export function lineWorkingValue(line: ReconcilableLine): number {
  if (line.total_override) return num(line.total);
  return num(line.quantity) * num(line.unit_price) - num(line.discount) + num(line.tax_amount);
}

/** Calculated invoice total from the working line values, less any header discount. */
export function calculatedInvoiceTotal(
  lines: ReconcilableLine[],
  invoiceDiscount: string | number | null | undefined = 0,
): number {
  const sum = (lines || []).reduce((s, l) => s + lineWorkingValue(l), 0);
  return round2(sum - num(invoiceDiscount));
}

/**
 * True when the printed/header total and the calculated line total differ by more
 * than the tolerance. Absent printed total = nothing to reconcile against.
 */
export function hasPrintedTotalMismatch(args: {
  printedTotal: number | null | undefined;
  calculatedTotal: number;
  tolerance?: number;
}): boolean {
  if (args.printedTotal === null || args.printedTotal === undefined) return false;
  const tolerance = args.tolerance ?? TOTAL_TOLERANCE;
  return Math.abs(args.printedTotal - args.calculatedTotal) > tolerance;
}

/** Sum of the amounts printed in the AMOUNT column (source truth, never recalculated). */
export function sumPrintedLineAmounts(lines: ReconcilableLine[]): number {
  return round2(
    (lines || []).reduce((s, l) => {
      const printed = l.printed_amount === null || l.printed_amount === undefined || l.printed_amount === ""
        ? num(l.total)
        : num(l.printed_amount);
      return s + printed;
    }, 0),
  );
}

/** Invoice-level gate: does this invoice's printed total fail to reconcile? */
export function invoiceTotalMismatch(inv: {
  ai_total?: number | null;
  invoice_discount?: string | number | null;
  line_items: ReconcilableLine[];
}, tolerance = TOTAL_TOLERANCE): boolean {
  return hasPrintedTotalMismatch({
    printedTotal: inv.ai_total ?? null,
    calculatedTotal: calculatedInvoiceTotal(inv.line_items || [], inv.invoice_discount ?? 0),
    tolerance,
  });
}
