// Pure daily revenue plan: splits a monthly goal across venue-days using each venue's
// recent same-weekday sales, skipping recurring closed weekdays. Guests follow from the
// average spend (given, or the venue's recent spend per guest).
export type PlanSale = { venue_id: string; date: string; total_sales: number; guests: number };
export type PlanDay = { venue_id: string; date: string; amount: number };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

export function buildRevenuePlan(year: number, month: number, amount: number, venueIds: string[], sales: PlanSale[], closedWeekdays: Record<string, number[]>, avgSpend?: number | null) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  const weights: PlanDay[] = [];
  for (const v of venueIds) {
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    for (const s of sales) if (s.venue_id === v) { sum[dow(s.date)] += Number(s.total_sales) || 0; cnt[dow(s.date)]++; }
    const any = cnt.some(c => c > 0);
    for (const d of dates) {
      const w = dow(d);
      if ((closedWeekdays[v] ?? []).includes(w)) continue;
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
