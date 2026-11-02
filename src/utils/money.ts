/** ISO-code driven money display. The base currency is set once per tenant session by AppLayout. */
let base = 'HKD';
export const setBaseCurrency = (code: string | null | undefined) => { if (code && /^[A-Z]{3}$/.test(code)) base = code; };
export const getBaseCurrency = () => base;

const LOCALE = 'en-HK'; // Distinguishes HK$ / US$ / A$ while keeping €, £.
const NARROW = new Set(['CNY', 'JPY', 'KRW', 'INR', 'THB', 'PHP', 'VND']);

/** Correct minor units from Intl (JPY 0, KWD 3, …). */
export function currencyDecimals(code: string): number {
  try { return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}

export function currencySymbol(code: string = base): string {
  try {
    const part = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code, currencyDisplay: NARROW.has(code) ? 'narrowSymbol' : 'symbol' })
      .formatToParts(0).find(p => p.type === 'currency');
    return part?.value ?? code;
  } catch { return code; }
}
/** Base currency symbol for labels such as "Amount (HK$)". */
export const baseSymbol = () => currencySymbol(base);

/** "US$1,200.00", "¥4,373.92", "JP¥1,200" style: symbol directly before the amount, ISO decimals. */
export function formatMoney(value: number, code: string = base, opts: { decimals?: number; space?: boolean } = {}): string {
  const d = opts.decimals ?? currencyDecimals(code);
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(Number(value) || 0));
  return `${Number(value) < 0 ? '-' : ''}${currencySymbol(code)}${opts.space ? ' ' : ''}${n}`;
}

export const formatRate = (rate: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(rate);

/** Foreign document line: "US$1,200.00 · HK$9,339.60 at 7.7830 (28 Oct)". Base documents show just the amount. */
export function formatWithBase(original: number, code: string | null | undefined, rate: number | null | undefined, rateDate?: string | null): string {
  const c = code || base;
  if (c === base || !rate) return formatMoney(original, c);
  const when = rateDate ? ` (${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${rateDate.slice(0, 10)}T00:00:00Z`))})` : '';
  return `${formatMoney(original, c)} · ${formatMoney(baseAmount(original, rate), base)} at ${formatRate(rate)}${when}`;
}

/** Base amount = original × rate, rounded to base minor units. */
export function baseAmount(original: number, rate: number, baseCode: string = base): number {
  const f = 10 ** currencyDecimals(baseCode);
  return Math.round(original * rate * f) / f;
}
