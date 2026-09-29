import type { TotalMismatchAcknowledgement } from "@/utils/invoiceTotalReconciliation";

export interface DismissibleInvoice {
  notes?: string;
  review_blocking?: string[];
  total_mismatch_acknowledgement?: TotalMismatchAcknowledgement | null;
  line_items: Array<{ review_blocking?: string[] }>;
}

const appendNote = (notes: string | undefined, note: string) => notes ? `${notes}\n${note}` : note;

export function dismissHeaderFinding<T extends DismissibleInvoice>(
  invoice: T,
  msgIndex: number,
  timestamp: string,
): T | null {
  const list = invoice.review_blocking || [];
  const message = list[msgIndex];
  if (message === undefined) return null;
  return {
    ...invoice,
    review_blocking: list.filter((_, index) => index !== msgIndex),
    notes: appendNote(invoice.notes, `[Flag acknowledged @ ${timestamp}] ${message}`),
  };
}

export function dismissLineFinding<T extends DismissibleInvoice>(
  invoice: T,
  lineIndex: number,
  msgIndex: number,
  timestamp: string,
): T | null {
  const line = invoice.line_items[lineIndex];
  const list = line?.review_blocking || [];
  const message = list[msgIndex];
  if (!line || message === undefined) return null;
  const lines = [...invoice.line_items];
  lines[lineIndex] = { ...line, review_blocking: list.filter((_, index) => index !== msgIndex) };
  return {
    ...invoice,
    line_items: lines,
    notes: appendNote(invoice.notes, `[Line ${lineIndex + 1} flag acknowledged @ ${timestamp}] ${message}`),
  };
}

export function acknowledgeTotalMismatch<T extends DismissibleInvoice>(
  invoice: T,
  pair: TotalMismatchAcknowledgement,
  timestamp: string,
): T {
  const note = `[Total mismatch acknowledged @ ${timestamp}] printed ${pair.printedTotal.toFixed(2)}, calculated ${pair.calculatedTotal.toFixed(2)}`;
  return {
    ...invoice,
    total_mismatch_acknowledgement: pair,
    notes: appendNote(invoice.notes, note),
  };
}