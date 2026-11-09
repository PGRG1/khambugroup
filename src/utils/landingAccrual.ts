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
