// Pure daily revenue plan: splits a monthly goal across venue-days using each venue's
// recent same-weekday sales, skipping recurring closed weekdays. Guests follow from the
// average spend (given, or the venue's recent spend per guest).
export type PlanSale = { venue_id: string; date: string; total_sales: number; guests: number };
export type PlanDay = { venue_id: string; date: string; amount: number };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

/**
 * Which venue-days a plan may still change: today onward with no sales recorded yet.
 * Past days and days with sales are locked; `locked` is what they already account for
 * (their sales, or their saved projection when no sales came in), so a plan spreads only
 * the rest of the goal across the open days.
 */
export function planWindow(today: string, monthSales: { venue_id: string; date: string; total_sales: number }[], saved: { venue_id: string; target_date: string; projected_sales: number }[]) {
  const sold = new Map<string, number>();
  for (const s of monthSales) { const k = `${s.venue_id}|${s.date}`; sold.set(k, (sold.get(k) ?? 0) + (Number(s.total_sales) || 0)); }
  const open = (v: string, d: string) => d >= today && !sold.has(`${v}|${d}`);
  let locked = 0;
  for (const x of sold.values()) locked += x;
  for (const p of saved) if (!open(p.venue_id, p.target_date) && !sold.has(`${p.venue_id}|${p.target_date}`)) locked += Number(p.projected_sales) || 0;
  return { open, locked };
}

export function buildRevenuePlan(year: number, month: number, amount: number, venueIds: string[], sales: PlanSale[], closedWeekdays: Record<string, number[]>, avgSpend?: number | null, open?: (venueId: string, date: string) => boolean) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  const weights: PlanDay[] = [];
  for (const v of venueIds) {
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    for (const s of sales) if (s.venue_id === v) { sum[dow(s.date)] += Number(s.total_sales) || 0; cnt[dow(s.date)]++; }
    const any = cnt.some(c => c > 0);
    for (const d of dates) {
      const w = dow(d);
      if ((closedWeekdays[v] ?? []).includes(w) || (open && !open(v, d))) continue;
      const avg = cnt[w] ? sum[w] / cnt[w] : any ? 0 : 1;
      if (avg > 0) weights.push({ venue_id: v, date: d, amount: avg });
    }
  }
  const total = weights.reduce((a, x) => a + x.amount, 0);
  const plan = weights.map(x => ({ ...x, amount: Math.round((x.amount / (total || 1)) * amount) }));
  if (plan.length) plan[plan.length - 1].amount += Math.round(amount) - plan.reduce((a, x) => a + x.amount, 0);
  const g = sales.reduce((a, s) => a + (Number(s.guests) || 0), 0), r = sales.reduce((a, s) => a + (Number(s.total_sales) || 0), 0);
  const spend = avgSpend && avgSpend > 0 ? avgSpend : g > 0 ? r / g : null;
  const byDow = Array(7).fill(0), dowDays = Array(7).fill(0);
  const perDate = new Map<string, number>();
  for (const p of plan) perDate.set(p.date, (perDate.get(p.date) ?? 0) + p.amount);
  for (const [d, a] of perDate) { byDow[dow(d)] += a; dowDays[dow(d)]++; }
  const weekday = [1, 2, 3, 4, 5, 6, 0].map(i => ({ day: DOW[i], per_day: dowDays[i] ? Math.round(byDow[i] / dowDays[i]) : 0 }));
  return { plan, trading_days: perDate.size, weekday, avg_spend: spend ? Math.round(spend) : null, guests: spend ? Math.round(amount / spend) : null, history_spend: g > 0 ? Math.round(r / g) : null };
}

type SavedRow = { venue_id: string; target_date: string; projected_sales: number; line_kind?: string | null };
/** Saved rows hold one line each (a whole day, a period, delivery or an event): one total per venue-day. */
export function sumLines(rows: SavedRow[]): SavedRow[] {
  const m = new Map<string, SavedRow>();
  for (const r of rows) {
    const k = `${r.venue_id}|${r.target_date}`, p = m.get(k);
    m.set(k, p ? { ...p, projected_sales: (Number(p.projected_sales) || 0) + (Number(r.projected_sales) || 0) } : { ...r, projected_sales: Number(r.projected_sales) || 0 });
  }
  return [...m.values()];
}
/** Venue-days planned line by line (not as one whole-day figure), with their total. */
export function lineDays(rows: SavedRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if ((r.line_kind ?? 'day') !== 'day') { const k = `${r.venue_id}|${r.target_date}`; m.set(k, (m.get(k) ?? 0) + (Number(r.projected_sales) || 0)); }
  return m;
}
