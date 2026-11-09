// Read-only revenue goal analysis for conversational planning. Never saves; set_revenue_target saves only after the user commits.
import { buildRevenuePlan } from './revenuePlan.ts';

export const planAnalysisTool = { type: 'function', function: { name: 'analyze_revenue_goal', description: 'READ-ONLY what-if analysis of a monthly revenue goal: typical vs needed sales per weekday, required lift, footfall and average-spend levers, current target and month-to-date. Use first whenever the user wants to plan, explore or discuss a target; re-run with new amount/avg_spend/guests as they adjust. Saves nothing.', parameters: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' }, amount: { type: 'number' }, venues: { type: 'array', items: { type: 'string' } }, avg_spend: { type: 'number' }, guests: { type: 'number', description: 'Monthly guests' } }, required: ['month', 'amount'], additionalProperties: false } } };

export async function analyzeRevenueGoal(args: any, admin: any, t: string) {
  const amount = Number(args.amount);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(args.month)) || !(amount > 0) || amount > 1e12) return { ok: false, error: 'Give the month (YYYY-MM) and a positive amount.' };
  const { data: venues, error } = await admin.from('venues').select('id,name,seats').eq('tenant_id', t).eq('is_active', true);
  if (error) return { ok: false, error: error.message };
  const names = (venues ?? []).map((v: any) => v.name);
  const picked = Array.isArray(args.venues) && args.venues.length ? args.venues.map((v: string) => names.find((n: string) => n.toLowerCase() === String(v).toLowerCase())) : names;
  if (picked.some((v: any) => !v)) return { ok: false, error: 'Unknown venue.', venues: names };
  const ids = (venues ?? []).filter((v: any) => picked.includes(v.name)).map((v: any) => v.id);
  const [y, m] = String(args.month).split('-').map(Number);
  const since = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);
  const start = `${args.month}-01`, end = `${args.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const [sales, rules, target, mtd] = await Promise.all([
    admin.from('sales_records').select('venue_id,date,total_sales,guests').eq('tenant_id', t).in('venue_id', ids).gte('date', since).limit(5000),
    admin.from('venue_closure_rules').select('venue_id,weekday,end_date').eq('tenant_id', t).in('venue_id', ids).not('weekday', 'is', null),
    admin.from('revenue_targets').select('target_amount').eq('tenant_id', t).eq('year', y).eq('month', m).maybeSingle(),
    admin.from('sales_records').select('total_sales').eq('tenant_id', t).in('venue_id', ids).gte('date', start).lte('date', end).limit(5000),
  ]);
  for (const r of [sales, rules, target, mtd]) if (r.error) return { ok: false, error: r.error.message };
  const closedW: Record<string, number[]> = {};
  for (const r of rules.data ?? []) if (!r.end_date) (closedW[r.venue_id] ??= []).push(r.weekday);
  const spendIn = Number(args.avg_spend), guestsIn = Number(args.guests);
  const avgSpend = spendIn > 0 ? spendIn : guestsIn > 0 ? amount / guestsIn : null;
  const plan = buildRevenuePlan(y, m, amount, ids, (sales.data ?? []) as any, closedW, avgSpend);
  // Typical per weekday from the same history (all picked venues combined per date).
  const byDate = new Map<string, { s: number; g: number }>();
  for (const s of sales.data ?? []) { const x = byDate.get(s.date) ?? { s: 0, g: 0 }; x.s += Number(s.total_sales) || 0; x.g += Number(s.guests) || 0; byDate.set(s.date, x); }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const acc = DOW.map(() => ({ s: 0, g: 0, n: 0 }));
  for (const [d, x] of byDate) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); acc[w].s += x.s; acc[w].g += x.g; acc[w].n++; }
  const weekdays = plan.weekday.filter(w => w.per_day).map(w => {
    const a = acc[DOW.indexOf(w.day)]; const typical = a.n ? Math.round(a.s / a.n) : null;
    return { day: w.day, typical, needed: w.per_day, lift_pct: typical ? Math.round((w.per_day / typical - 1) * 100) : null, typical_guests: a.n && a.g ? Math.round(a.g / a.n) : null };
  });
  const usualMonth = weekdays.length ? plan.plan.reduce((sum, p) => { const a = acc[new Date(p.date + 'T00:00:00Z').getUTCDay()]; return sum + (a.n ? a.s / a.n / Math.max(1, ids.length) : 0); }, 0) : null;
  const totalGuests = [...byDate.values()].reduce((a, x) => a + x.g, 0);
  const usualGuestsDay = byDate.size && totalGuests ? Math.round(totalGuests / byDate.size) : null;
  const perDay = plan.trading_days ? amount / plan.trading_days : null;
  const seats = (venues ?? []).filter((v: any) => picked.includes(v.name)).reduce((a: number, v: any) => a + (Number(v.seats) || 0), 0) || null;
  const spendForSeats = plan.avg_spend ?? plan.history_spend;
  const capacity = seats && spendForSeats ? weekdays.map(w => ({ day: w.day, guests_needed: Math.round(w.needed / spendForSeats), seat_turns: Math.round(w.needed / spendForSeats / seats * 10) / 10 })) : null;
  return {
    ok: true, saved: false, seats, capacity, realistic_max_turns_per_day: 2.5, month: args.month, venues: picked, goal: amount, trading_days: plan.trading_days,
    current_target: target.data?.target_amount != null ? Number(target.data.target_amount) : null,
    month_to_date_sales: (mtd.data ?? []).reduce((a: number, r: any) => a + (Number(r.total_sales) || 0), 0),
    usual_month_at_current_pace: usualMonth ? Math.round(usualMonth) : null,
    needed_per_trading_day: perDay ? Math.round(perDay) : null,
    weekdays, history_days: byDate.size,
    levers: {
      footfall: plan.history_spend && perDay ? { keep_avg_spend: plan.history_spend, guests_per_day: Math.round(perDay / plan.history_spend), usual_guests_per_day: usualGuestsDay } : null,
      spend: usualGuestsDay && perDay ? { keep_guests_per_day: usualGuestsDay, avg_spend_needed: Math.round(perDay / usualGuestsDay), usual_avg_spend: plan.history_spend } : null,
      chosen: plan.avg_spend ? { avg_spend: plan.avg_spend, guests_month: plan.guests } : null,
    },
    note: 'Nothing saved. Act as the expert finance team: headline vs usual pace, one chart, one compact table, then 2-3 concrete named options (e.g. Balanced, Spend-led, Events/buyouts) each with real guests, spend and seat turns. Use capacity: any day above realistic_max_turns_per_day is not physically achievable — say so plainly and recommend the option that is. Give your recommendation. Do not ask open questions; suggest_replies with the options plus "Lock it in". Only propose set_revenue_target when the user commits.',
  };
}
