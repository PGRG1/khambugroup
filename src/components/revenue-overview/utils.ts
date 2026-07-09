import { SalesRecord } from "@/types/sales";

export function fmtHKD(n: number, compact = false): string {
  if (!isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    const units = [
      { v: 1e9, s: "B" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const u of units) {
      if (Math.abs(n) >= u.v) return `${(n / u.v).toFixed(1).replace(/\.0$/, "")}${u.s}`;
    }
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtNum(n: number, compact = false): string {
  if (!isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export type Agg = {
  revenue: number;
  guests: number;
  orders: number;
  discount: number;
  gross: number; // revenue + |discount|
  days: number;
};

export function aggregate(records: SalesRecord[]): Agg {
  const days = new Set(records.map((r) => r.date)).size;
  let revenue = 0, guests = 0, orders = 0, discount = 0;
  for (const r of records) {
    revenue += r.totalSales;
    guests += r.guests;
    orders += r.orders;
    discount += r.discount; // negative
  }
  const gross = revenue + Math.abs(discount);
  return { revenue, guests, orders, discount, gross, days: days || 0 };
}

export type DailyPoint = { date: string; revenue: number; guests: number; orders: number; discount: number; gross: number };

export function toDaily(records: SalesRecord[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const r of records) {
    const p = map.get(r.date) ?? { date: r.date, revenue: 0, guests: 0, orders: 0, discount: 0, gross: 0 };
    p.revenue += r.totalSales;
    p.guests += r.guests;
    p.orders += r.orders;
    p.discount += r.discount; // stored negative
    map.set(r.date, p);
  }
  for (const p of map.values()) p.gross = p.revenue + Math.abs(p.discount);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function movingAvg(points: DailyPoint[], window = 7): (number | null)[] {
  return points.map((_, i) => {
    if (i < window - 1) return null;
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) s += points[j].revenue;
    return s / window;
  });
}

export function pctDelta(cur: number, prev: number): number | null {
  if (!prev || !isFinite(prev)) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function dateRangeDays(from?: Date, to?: Date): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

export function priorRange(from?: Date, to?: Date): { from: Date; to: Date } | null {
  if (!from || !to) return null;
  const len = dateRangeDays(from, to)!;
  const pTo = new Date(from);
  pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo);
  pFrom.setDate(pFrom.getDate() - (len - 1));
  return { from: pFrom, to: pTo };
}

export function inRange(dateStr: string, from?: Date, to?: Date): boolean {
  if (!from && !to) return true;
  const d = new Date(dateStr).getTime();
  if (from && d < new Date(from.toDateString()).getTime()) return false;
  if (to) {
    const t = new Date(to.toDateString()); t.setHours(23, 59, 59, 999);
    if (d > t.getTime()) return false;
  }
  return true;
}
