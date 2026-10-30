import { isLineMathFlag } from "@/utils/invoiceLineMath";

interface DisplayLine {
  quantity: string;
  unit_price: string;
  printed_amount?: string;
  total?: string;
  discount?: string;
  tax_amount?: string;
  counts_toward_total?: boolean;
  review_warnings?: string[];
}
const number = (value: unknown) => value == null || value === "" ? NaN : Number(value);
const roundingFlag = (message: string) => isLineMathFlag(message) || /rounding|round-off/i.test(message);

/** Presentation-only copies: never pass these to validation, AI or persistence. */
export function invoiceReviewDisplay<T extends { line_items: DisplayLine[]; ai_total?: number; review_warnings?: string[] }>(invoice: T, calculatedTotal: number) {
  const totalDifference = Math.abs(number(invoice.ai_total) - calculatedTotal);
  const totalUnderOne = Number.isFinite(totalDifference) && totalDifference < 1;
  const accepted: { lineIdx?: number; difference: number; messages: string[] }[] = [];
  const line_items = invoice.line_items.map((line, lineIdx) => {
    const printed = number(line.printed_amount);
    const difference = Math.abs(number(line.quantity) * number(line.unit_price) - printed);
    // A discount/tax difference is not rounding. Missing source evidence is not acceptance.
    const small = totalUnderOne && Number.isFinite(difference) && difference < 1
      && !(Number(line.discount) || Number(line.tax_amount));
    const messages = small ? (line.review_warnings || []).filter(roundingFlag) : [];
    if (small && (difference > 0 || messages.length)) accepted.push({ lineIdx, difference, messages });
    return { ...line, review_warnings: (line.review_warnings || []).filter(message => !messages.includes(message)) };
  });
  const sourceLines = invoice.line_items.filter(line => line.counts_toward_total !== false);
  const allSmall = sourceLines.length > 0 && sourceLines.every(line => {
    const delta = Math.abs(number(line.quantity) * number(line.unit_price) - number(line.printed_amount));
    return Number.isFinite(delta) && delta < 1 && !(Number(line.discount) || Number(line.tax_amount));
  });
  const headerMessages = totalUnderOne && allSmall ? (invoice.review_warnings || []).filter(message =>
    /^(total_amount|subtotal|line_totals|totals|amount):/i.test(message) || /rounding|round-off/i.test(message)) : [];
  if (headerMessages.length || (totalUnderOne && allSmall && totalDifference > 0)) accepted.push({ difference: totalDifference, messages: headerMessages });
  return { invoice: { ...invoice, line_items, review_warnings: (invoice.review_warnings || []).filter(message => !headerMessages.includes(message)) }, accepted };
}