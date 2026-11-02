import { baseAmount, formatMoney } from './money';

export type FxDoc = { currency: string; fx_rate?: number | null; original_total?: number | null; total_amount: number; subtotal?: number; tax_amount?: number };

/**
 * Foreign documents keep the original total; total/subtotal/tax and lines are stored in base = original × rate.
 * Returns the factor to apply to line amounts. Base-currency documents pass through unchanged.
 */
export function convertDocument<T extends FxDoc>(doc: T, base: string, rate: number | null): { doc: T & { original_total: number | null; fx_rate: number | null }; factor: number; original: { total: number; subtotal: number; tax_amount: number } | null } {
  if (!doc.currency || doc.currency === base) return { doc: { ...doc, original_total: null, fx_rate: null }, factor: 1, original: null };
  if (!rate || rate <= 0) throw new Error(`No ${doc.currency} → ${base} rate for this date; enter the rate printed on the document.`);
  const original = doc.original_total ?? Number(doc.total_amount);
  const current = doc.original_total != null ? Number(doc.total_amount) : original; // amounts now held
  const total = baseAmount(original, rate, base);
  const factor = current ? total / current : 0;
  const r2 = (n: number) => Math.round(n * factor * 100) / 100;
  return { doc: { ...doc, original_total: original, fx_rate: rate, total_amount: total, subtotal: r2(Number(doc.subtotal ?? 0)), tax_amount: r2(Number(doc.tax_amount ?? 0)) }, factor, original: { total: original, subtotal: Number(doc.subtotal ?? 0), tax_amount: Number(doc.tax_amount ?? 0) } };
}

/** "US$1,200.00 · €50.00" — remaining amounts per document currency (base items ignored); '' when none. */
export function owedInCurrency(items: { currency?: string | null; owed_in_currency?: number | null }[], base: string): string {
  const sums = new Map<string, number>();
  for (const i of items) if (i.currency && i.currency !== base && i.owed_in_currency != null) sums.set(i.currency, (sums.get(i.currency) ?? 0) + Number(i.owed_in_currency));
  return [...sums].map(([c, n]) => formatMoney(Math.round(n * 100) / 100, c)).join(' · ');
}
