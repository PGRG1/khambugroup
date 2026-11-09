// Accrual view of an open month for Home: costs incurred so far, even before payroll
// or stock are posted. Display only — never writes or replaces booked figures.
export type PayrollRow = { year: number; month: number; gross_salary: number; mpf_employer: number };
export type Booked = { sales: number; food: number; staff: number | null; running: number };

/** Staff cost so far: booked when posted, otherwise the latest earlier payroll month pro-rated by days elapsed. */
export function accruedStaff(month: string, booked: number | null, payroll: PayrollRow[], daysGone: number, daysInMonth: number, usualPct: number | null, sales: number) {
  if (booked) return { amount: booked, basis: "booked" as const };
  const totals = new Map<string, number>();
  for (const p of payroll) {
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    if (key < month) totals.set(key, (totals.get(key) ?? 0) + Number(p.gross_salary || 0) + Number(p.mpf_employer || 0));
  }
  const last = [...totals.keys()].sort().pop();
  if (last && totals.get(last)! > 0 && daysInMonth > 0) return { amount: (totals.get(last)! * Math.min(daysGone, daysInMonth)) / daysInMonth, basis: "accrued" as const, from: last };
  if (usualPct && sales > 0) return { amount: (usualPct / 100) * sales, basis: "estimated" as const };
  return { amount: null, basis: "unknown" as const };
}

/** Theoretical stock used: sales × menu food-cost % from saved recipes, plus logged waste. */
export function theoreticalStock(sales: number, menuCostPct: number | null, waste: number) {
  if (menuCostPct == null || !(sales > 0)) return waste > 0 ? waste : null;
  return (menuCostPct / 100) * sales + waste;
}

/** Average food-cost % across priced dishes. */
export function menuCostPercent(dishes: { cost: number; price: number }[]) {
  const priced = dishes.filter((d) => d.price > 0);
  return priced.length ? (priced.reduce((a, d) => a + d.cost / d.price, 0) / priced.length) * 100 : null;
}

/** Profit so far on an accrual basis. */
export function accruedProfit(sales: number, stock: number | null, staff: number | null, running: number) {
  if (stock == null || staff == null) return null;
  return sales - stock - staff - running;
}

export type ShiftRow = { employee_id: string; shift_date: string; start_time: string | null; end_time: string | null; break_minutes: number | null; actual_hours_worked?: number | null; no_show?: boolean | null; venue_id?: string | null };
export type PayRow = PayrollRow & { employee_id: string };

/** Hours of one shift: worked hours when recorded, otherwise the rota times less the break. */
export function shiftHours(s: ShiftRow): number {
  if (s.no_show) return 0;
  if (s.actual_hours_worked != null) return Number(s.actual_hours_worked) || 0;
  if (!s.start_time || !s.end_time) return 0;
  const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + (mi || 0); };
  let mins = m(s.end_time) - m(s.start_time);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, mins - (Number(s.break_minutes) || 0)) / 60;
}

/** Staff cost from the rota: hours on the rota up to `until`, each costed at what that person
 *  cost per rota hour in the latest earlier payroll month. Null when there's no rota or no payroll to cost it. */
export function rotaStaff(month: string, until: string, shifts: ShiftRow[], payroll: PayRow[], inScope: (s: ShiftRow) => boolean = () => true): number | null {
  const key = (p: PayrollRow) => `${p.year}-${String(p.month).padStart(2, "0")}`;
  const base = [...new Set(payroll.map(key))].filter((k) => k < month).sort().pop();
  if (!base) return null;
  const pay = new Map<string, number>();
  for (const p of payroll) if (key(p) === base) pay.set(p.employee_id, (pay.get(p.employee_id) ?? 0) + Number(p.gross_salary || 0) + Number(p.mpf_employer || 0));
  const baseHours = new Map<string, number>();
  for (const s of shifts) if (s.shift_date.slice(0, 7) === base) baseHours.set(s.employee_id, (baseHours.get(s.employee_id) ?? 0) + shiftHours(s));
  let payT = 0, hoursT = 0;
  const rate = new Map<string, number>();
  for (const [e, amt] of pay) { const h = baseHours.get(e) ?? 0; if (h > 0 && amt > 0) { rate.set(e, amt / h); payT += amt; hoursT += h; } }
  if (!hoursT) return null;
  const avgRate = payT / hoursT;
  const now = shifts.filter((s) => s.shift_date.slice(0, 7) === month && s.shift_date <= until && inScope(s));
  if (!now.length) return null;
  return now.reduce((a, s) => a + shiftHours(s) * (rate.get(s.employee_id) ?? avgRate), 0);
}
