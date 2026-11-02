/** Pure month-to-date vs same-period-last-year maths for the landing page. */
export type SaleRow = { date: string; venue_id: string | null; subtotal: number | null; service_charge: number | null; guests: number | null };
export type Stat = { value: number | null; why?: string };
export type Compare = { now: Stat; last: Stat; changePct: number | null };

const rev = (r: SaleRow) => (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0);
const days = (rows: SaleRow[]) => new Set(rows.map((r) => `${r.venue_id ?? ""}|${r.date}`)).size;

/** Daily averages = total ÷ unique trading days (per venue-day). */
export function salesPerDay(rows: SaleRow[]): Stat {
  const d = days(rows);
  if (!d) return { value: null, why: "no sales recorded" };
  return { value: rows.reduce((s, r) => s + rev(r), 0) / d };
}
export function guestsPerDay(rows: SaleRow[]): Stat {
  const d = days(rows);
  if (!d) return { value: null, why: "no sales recorded" };
  const g = rows.reduce((s, r) => s + (Number(r.guests) || 0), 0);
  if (g <= 0) return { value: null, why: "guest counts aren't recorded" };
  return { value: g / d };
}
export function spendPerGuest(rows: SaleRow[]): Stat {
  if (!rows.length) return { value: null, why: "no sales recorded" };
  const g = rows.reduce((s, r) => s + (Number(r.guests) || 0), 0);
  if (g <= 0) return { value: null, why: "guest counts aren't recorded" };
  return { value: rows.reduce((s, r) => s + rev(r), 0) / g };
}
export function compare(now: Stat, last: Stat): Compare {
  const changePct = now.value != null && last.value != null && last.value > 0 ? ((now.value - last.value) / last.value) * 100 : null;
  return { now, last, changePct };
}
/** Month-to-date window through yesterday, plus the same days last year. */
export function mtdWindows(today: Date) {
  const y = today.getFullYear(), m = today.getMonth();
  const end = new Date(y, m, today.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = new Date(y, m, 1);
  const effEnd = end < start ? start : end;
  const lyEnd = new Date(y - 1, m, Math.min(effEnd.getDate(), new Date(y - 1, m + 1, 0).getDate()));
  return { from: iso(start), to: iso(effEnd), lyFrom: iso(new Date(y - 1, m, 1)), lyTo: iso(lyEnd), noDaysYet: end < start };
}
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Sales a day by weekday (index 0 = Sunday). */
export function byWeekday(rows: SaleRow[]): (number | null)[] {
  return WEEKDAYS.map((_, i) => salesPerDay(rows.filter((r) => new Date(`${r.date}T00:00:00`).getDay() === i)).value);
}
