// Pure rules for the Sales records page: "doesn't add up", missing days, unusual days, week groups.
import type { SalesRecord } from "@/types/sales";
import { getPaymentTotal } from "@/utils/salesUtils";

export const ADD_UP_TOLERANCE = 0.5;
export const NOTE_TAGS = ["Closed early", "Private event", "Weather", "POS problem", "Staff short", "Other"] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

export interface AddUpCheck {
  ok: boolean;
  /** Payments total minus total sales (negative = short). */
  paymentGap: number;
  /** Food & drink + service charge + discounts. */
  partsTotal: number;
  paymentsWrong: boolean;
  partsWrong: boolean;
}

export function checkRecord(r: SalesRecord): AddUpCheck {
  const payments = getPaymentTotal(r);
  const paymentGap = payments - r.totalSales;
  const partsTotal = r.subtotal + r.serviceCharge + r.discount;
  const paymentsWrong = Math.abs(paymentGap) > ADD_UP_TOLERANCE;
  const partsWrong = Math.abs(partsTotal - r.totalSales) > ADD_UP_TOLERANCE;
  return { ok: !paymentsWrong && !partsWrong, paymentGap, partsTotal, paymentsWrong, partsWrong };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDaysIso(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}
const weekday = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };

export interface MissingDay { date: string; venue: string; venueId: string }

/**
 * Every date from `from` to min(`to`, yesterday) with no record for an active venue in scope.
 * Records are matched per venue per day, so a venue with service periods is flagged only when the whole day is missing.
 */
export function missingDays(records: SalesRecord[], venues: { id: string; name: string }[], from: string, to: string, today: string): MissingDay[] {
  const yesterday = addDaysIso(today, -1);
  const end = to < yesterday ? to : yesterday;
  if (from > end) return [];
  const have = new Set(records.map((r) => `${r.venue}|${r.date}`));
  const out: MissingDay[] = [];
  for (let d = from; d <= end; d = addDaysIso(d, 1)) {
    for (const v of venues) if (!have.has(`${v.name}|${d}`)) out.push({ date: d, venue: v.name, venueId: v.id });
  }
  return out;
}

/** Today's date (YYYY-MM-DD) in a timezone, e.g. the tenant's. */
export function todayInTz(tz = "Asia/Hong_Kong", now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return isoDay(now);
  }
}

export interface MissingRun { venue: string; venueId: string; start: string; end: string; days: number }

/**
 * Missing days collapsed into consecutive runs per venue. Each venue is checked only from its first
 * recorded sale ever (from `allRecords`) and only up to yesterday. Venues with no sales ever are returned
 * separately in `neverSold` and not flagged day by day.
 */
export function missingRuns(
  records: SalesRecord[], allRecords: SalesRecord[], venues: { id: string; name: string }[],
  from: string, to: string, today: string,
): { runs: MissingRun[]; neverSold: { id: string; name: string }[] } {
  const first = new Map<string, string>();
  for (const r of allRecords) { const f = first.get(r.venue); if (!f || r.date < f) first.set(r.venue, r.date); }
  const neverSold = venues.filter((v) => !first.has(v.name));
  const runs: MissingRun[] = [];
  for (const v of venues) {
    const f = first.get(v.name);
    if (!f) continue;
    const start = f > from ? f : from;
    let cur: MissingRun | null = null;
    for (const m of missingDays(records, [v], start, to, today)) {
      if (cur && addDaysIso(cur.end, 1) === m.date) { cur.end = m.date; cur.days++; }
      else { cur = { venue: v.name, venueId: v.id, start: m.date, end: m.date, days: 1 }; runs.push(cur); }
    }
  }
  return { runs, neverSold };
}

/** "Sun 25 Oct" or "23–25 Oct (3 days)". */
export function runLabel(run: Pick<MissingRun, "start" | "end" | "days">): string {
  if (run.days === 1) return shortDay(run.start);
  const [, m1, d1] = run.start.split("-").map(Number);
  const [, m2, d2] = run.end.split("-").map(Number);
  const range = m1 === m2 ? `${d1}–${d2} ${MON[m2 - 1]}` : `${d1} ${MON[m1 - 1]} – ${d2} ${MON[m2 - 1]}`;
  return `${range} (${run.days} days)`;
}

/** Sales vs the venue's average for the same weekday over the previous 8 weeks; null when there's no history. */
export function unusualDay(record: Pick<SalesRecord, "date" | "venue" | "totalSales">, history: SalesRecord[]): { pct: number; weekday: string } | null {
  if (!record.date || !record.venue) return null;
  const wd = weekday(record.date);
  const start = addDaysIso(record.date, -56);
  const byDay = new Map<string, number>();
  for (const r of history) {
    if (r.venue !== record.venue || r.date < start || r.date >= record.date || weekday(r.date) !== wd) continue;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.totalSales);
  }
  if (byDay.size === 0) return null;
  const avg = [...byDay.values()].reduce((s, v) => s + v, 0) / byDay.size;
  if (avg <= 0) return null;
  const pct = Math.round(((record.totalSales - avg) / avg) * 100);
  if (Math.abs(pct) < 30) return null;
  return { pct, weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd] };
}

/** Plain sentence for the add-sales prompt, or null when nothing looks off. */
export function notePrompt(record: SalesRecord, history: SalesRecord[]): string | null {
  if (!record.date || !record.totalSales) return null;
  const c = checkRecord(record);
  if (!c.ok) return "This day doesn't add up. What happened?";
  const u = unusualDay(record, history);
  if (!u) return null;
  return `Sales are ${Math.abs(u.pct)}% ${u.pct < 0 ? "below" : "above"} a usual ${u.weekday}. What happened?`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function shortDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${MON[m - 1]}`;
}
/** Monday of the week containing iso. */
export function weekStart(iso: string) { const wd = (weekday(iso) + 6) % 7; return addDaysIso(iso, -wd); }
export function weekLabel(iso: string, today: string) {
  const ws = weekStart(iso), cur = weekStart(today);
  if (ws === cur) return "This week";
  if (ws === addDaysIso(cur, -7)) return "Last week";
  const we = addDaysIso(ws, 6);
  const [, m1, d1] = ws.split("-").map(Number);
  const [, m2, d2] = we.split("-").map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MON[m2 - 1]}` : `${d1} ${MON[m1 - 1]} – ${d2} ${MON[m2 - 1]}`;
}
