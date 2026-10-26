/**
 * Plain-English helpers for the Revenue Overview "so far" card.
 * Pure functions: no React, no I/O.
 */
import type { DailyProjectionRow } from "@/utils/dailyProjections";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "October so far" for the current month. */
export function monthSoFarLabel(today = new Date()): string {
  return `${MONTHS[today.getMonth()]} so far`;
}

/** Short money: HK$3.74M, HK$202k, HK$950. */
export function shortMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}HK$${(a / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (a >= 1_000) return `${sign}HK$${Math.round(a / 1_000)}k`;
  return `${sign}HK$${Math.round(a)}`;
}

function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return iso(new Date(y, m - 1, d + n));
}
function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}
function shiftMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return iso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

export interface ComparisonWindowResult {
  from: string;
  to: string;
  days: number;
  /** "last October" / "last September" / "last year" */
  name: string;
  kind: "last-year" | "last-month";
}

/**
 * Same elapsed days of the same month last year; if last year's data does not
 * cover those days, the same elapsed days of last month; otherwise null.
 * `periodTo` is clamped to today. Data covers a window when the earliest
 * record is on/before its start and the latest on/after its end.
 */
export function comparisonWindow(
  periodFrom: string,
  periodTo: string,
  today: string,
  dataFirst: string | null,
  dataLast: string | null,
): ComparisonWindowResult | null {
  const to = periodTo > today ? today : periodTo;
  if (to < periodFrom || !dataFirst || !dataLast) return null;
  const days = daysBetween(periodFrom, to);
  const covers = (f: string, t: string) => dataFirst <= f && dataLast >= t;
  const singleMonth = periodFrom.slice(0, 7) === to.slice(0, 7);
  const monthName = (isoDate: string) => MONTHS[Number(isoDate.slice(5, 7)) - 1];

  const lyFrom = shiftMonths(periodFrom, -12);
  const lyTo = addDays(lyFrom, days - 1);
  if (covers(lyFrom, lyTo)) {
    return { from: lyFrom, to: lyTo, days, kind: "last-year", name: singleMonth ? `last ${monthName(periodFrom)}` : "last year" };
  }
  if (singleMonth) {
    const lmFrom = shiftMonths(periodFrom, -1);
    const lmTo = addDays(lmFrom, days - 1);
    if (covers(lmFrom, lmTo)) return { from: lmFrom, to: lmTo, days, kind: "last-month", name: `last ${monthName(lmFrom)}` };
  }
  return null;
}

/** "6% less than the same 26 days last October." */
export function comparisonSentence(cur: number, prev: number, win: ComparisonWindowResult): string | null {
  if (!(prev > 0)) return null;
  const pct = ((cur - prev) / prev) * 100;
  const span = `the same ${win.days} day${win.days === 1 ? "" : "s"} ${win.name}`;
  if (Math.abs(pct) < 0.5) return `About the same as ${span}.`;
  return `${Math.round(Math.abs(pct))}% ${pct > 0 ? "more" : "less"} than ${span}.`;
}

export interface TargetPace {
  target: number;
  sold: number;
  /** Sum of daily targets up to and including the last counted day. */
  shouldBy: number;
  /** Calendar days still to come in the month. */
  remainingDays: number;
  /** (target − sold) ÷ remaining days; null when no days remain. */
  needPerDay: number | null;
  /** Sold ÷ elapsed days. */
  averaging: number;
  elapsedDays: number;
}

/**
 * Month pacing from (combined) projection rows. The last counted day is
 * today, or yesterday when today has no sales yet; for past months it is the
 * month end.
 */
export function targetPace(rows: DailyProjectionRow[], today: string): TargetPace | null {
  if (!rows.length) return null;
  const monthEnd = rows[rows.length - 1].date;
  let cutoff = today > monthEnd ? monthEnd : today;
  if (cutoff === today) {
    const todayRow = rows.find((r) => r.date === today);
    if (todayRow && todayRow.actualSales === null) cutoff = addDays(today, -1);
  }
  const target = rows.reduce((a, r) => a + (r.effectiveForecast ?? 0), 0);
  const sold = rows.reduce((a, r) => a + (r.actualSales ?? 0), 0);
  const counted = rows.filter((r) => r.date <= cutoff);
  const shouldBy = counted.reduce((a, r) => a + (r.effectiveForecast ?? 0), 0);
  const remainingDays = rows.filter((r) => r.date > cutoff).length;
  const elapsedDays = counted.length;
  return {
    target, sold, shouldBy, remainingDays, elapsedDays,
    needPerDay: remainingDays > 0 ? Math.max(0, target - sold) / remainingDays : null,
    averaging: elapsedDays > 0 ? sold / elapsedDays : 0,
  };
}

export function paceSentence(p: TargetPace): string {
  if (p.target <= 0) return "";
  if (p.remainingDays === 0) {
    return `The month finished at ${Math.round((p.sold / p.target) * 100)}% of the ${shortMoney(p.target)} target.`;
  }
  if (p.sold >= p.target) return `You've already passed the ${shortMoney(p.target)} target. You're averaging ${shortMoney(p.averaging)} a day.`;
  const at = p.shouldBy > 0 ? Math.round((p.sold / p.shouldBy) * 100) : null;
  const days = `${p.remainingDays} day${p.remainingDays === 1 ? "" : "s"}`;
  const lead = at === null
    ? "No sales counted yet this month."
    : p.sold >= p.shouldBy
      ? `You're ahead: at ${at}% of where you should be by today.`
      : `You're at ${at}% of where you should be by today.`;
  return `${lead} To reach ${shortMoney(p.target)} you need about ${shortMoney(p.needPerDay ?? 0)} a day for the last ${days}. You're averaging ${shortMoney(p.averaging)}.`;
}

/** Sum per-venue projection rows into one row per date. */
export function combineProjectionRows(perVenue: DailyProjectionRow[][]): DailyProjectionRow[] {
  const byDate = new Map<string, DailyProjectionRow>();
  for (const rows of perVenue) {
    for (const r of rows) {
      const cur = byDate.get(r.date);
      if (!cur) { byDate.set(r.date, { ...r }); continue; }
      const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
      cur.projectedSales = add(cur.projectedSales, r.projectedSales);
      cur.autoForecast = add(cur.autoForecast, r.autoForecast);
      cur.effectiveForecast = add(cur.effectiveForecast, r.effectiveForecast);
      cur.actualSales = add(cur.actualSales, r.actualSales);
      cur.forecastSource = cur.forecastSource === "manager" || r.forecastSource === "manager" ? "manager" : cur.forecastSource === "auto" || r.forecastSource === "auto" ? "auto" : "none";
    }
  }
  const out = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of out) r.variance = r.actualSales !== null && r.effectiveForecast !== null ? r.actualSales - r.effectiveForecast : null;
  return out;
}

/** Best and worst trading day by sales. */
export function bestWorst<T extends { date: string; revenue: number }>(days: T[]): { best: T; worst: T } | null {
  if (days.length < 2) return null;
  let best = days[0], worst = days[0];
  for (const d of days) { if (d.revenue > best.revenue) best = d; if (d.revenue < worst.revenue) worst = d; }
  return best === worst ? null : { best, worst };
}
