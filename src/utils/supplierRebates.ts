// Supplier rebates (money back over a spend) and item deals (buy X get Y, discount): pure rules for Master data.

export type Rebate = { id: string; supplier_id: string; threshold: number; basis: 'percent' | 'fixed'; value: number; period: 'monthly' | 'quarterly' | 'yearly' | null; starts_on: string; ends_on: string | null; is_active: boolean };
export type SpendRow = { supplier_id: string | null; date: string; total: number };

const short = (n: number) => n >= 1000 ? `HK$${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : `HK$${Math.round(n).toLocaleString('en-HK')}`;
const money = (n: number) => `HK$${Math.round(n).toLocaleString('en-HK')}`;

/** The rebate period that contains `day` (YYYY-MM-DD), never before the rebate starts. */
export function periodWindow(r: Pick<Rebate, 'period' | 'starts_on'> & { ends_on?: string | null }, day: string): { from: string; to: string } {
  if (!r.period) return { from: r.starts_on, to: r.ends_on ?? day };
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  let from: string, to: string;
  if (r.period === 'monthly') { from = iso(y, m, 1); to = iso(y, m + 1, 0); }
  else if (r.period === 'quarterly') { const q = Math.floor((m - 1) / 3) * 3 + 1; from = iso(y, q, 1); to = iso(y, q + 3, 0); }
  else { from = iso(y, 1, 1); to = iso(y, 12, 31); }
  return { from: from < r.starts_on ? r.starts_on : from, to };
}

/** Spend in the current period and whether the rebate is earned. */
export function rebateProgress(r: Rebate, spend: SpendRow[], supplierIds: Set<string>, today: string) {
  const w = periodWindow(r, today);
  const spent = spend.filter((s) => s.supplier_id && supplierIds.has(s.supplier_id) && s.date >= w.from && s.date <= w.to).reduce((n, s) => n + s.total, 0);
  const earned = spent >= r.threshold;
  const amount = r.basis === 'percent' ? spent * r.value / 100 : r.value;
  return { ...w, spent, earned, pct: Math.round(spent / r.threshold * 100), amount: earned ? amount : 0 };
}

export const PERIOD_WORD = { monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' } as const;

const dmy = (d: string, year = true) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
/** "1 Jan – 31 Dec 2026", "1 Dec 2026 – 31 Jan 2027". */
export function rangeLabel(from: string, to: string) {
  return `${dmy(from, from.slice(0, 4) !== to.slice(0, 4))} – ${dmy(to)}`;
}

/** "2% over HK$100k · to 31 Dec 2026" (older repeating ones: "· quarterly"). */
export function rebateLabel(r: Pick<Rebate, 'basis' | 'value' | 'threshold' | 'period'> & { ends_on?: string | null }) {
  const when = r.period ? PERIOD_WORD[r.period] : r.ends_on ? `to ${dmy(r.ends_on)}` : '';
  return `${r.basis === 'percent' ? `${r.value}%` : money(r.value)} over ${short(r.threshold)}${when ? ` · ${when}` : ''}`;
}

export type ItemDeal = { deal_type: string; buy_qty: number | null; free_qty: number | null; discount_percent?: number | null; special_price?: number | null; valid_until?: string | null; is_active: boolean };
const until = (d?: string | null) => d ? ` · to ${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : '';

/** "Buy 2 get 1 · to 31 Dec", "10% off · HK$171", "Special price HK$150". */
export function dealLabel(d: ItemDeal, price?: number | null) {
  if (d.deal_type === 'discount') {
    if (d.special_price != null) return `Special price ${money(d.special_price)}${until(d.valid_until)}`;
    const pct = Number(d.discount_percent ?? 0);
    return `${pct}% off${price ? ` · ${money(price * (1 - pct / 100))}` : ''}${until(d.valid_until)}`;
  }
  return `Buy ${Number(d.buy_qty)} get ${Number(d.free_qty)}${until(d.valid_until)}`;
}

/** A deal counts only while active and inside its dates. */
export const dealLive = (d: ItemDeal & { valid_from?: string | null }, today: string) => d.is_active && (!d.valid_from || d.valid_from <= today) && (!d.valid_until || d.valid_until >= today);
