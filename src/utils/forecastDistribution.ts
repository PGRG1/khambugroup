import { SalesRecord } from "@/types/sales";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function getDayName(dateStr: string): string {
  return DAYS[new Date(dateStr).getDay()];
}

/** Returns days array for the given year/month (Date objects, local time noon to avoid TZ issues) */
export function getDatesInMonth(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) dates.push(new Date(year, month - 1, d, 12));
  return dates;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface MedianByDOW {
  /** Median total guests on this DOW (across selected venues, summed per date) */
  guestsByDow: Record<string, number>;
  /** Median avg-spend-per-guest on this DOW */
  avgSpendByDow: Record<string, number>;
  /** True if any historical data was available */
  hasData: boolean;
}

/**
 * Compute median guests and median avg-spend by day-of-week from historical sales
 * for the given venues, looking back `lookbackMonths` from today.
 */
export function computeDowMedians(
  salesData: SalesRecord[],
  venues: string[],
  lookbackMonths = 3
): MedianByDOW {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const cutoffIso = toIsoDate(cutoff);

  // Group sales: aggregate per date across selected venues
  const perDate = new Map<string, { guests: number; sales: number }>();
  for (const s of salesData) {
    if (!venues.includes(s.venue)) continue;
    if (s.date < cutoffIso) continue;
    const cur = perDate.get(s.date) ?? { guests: 0, sales: 0 };
    cur.guests += s.guests;
    cur.sales += s.totalSales;
    perDate.set(s.date, cur);
  }

  const guestsByDowRaw: Record<string, number[]> = {};
  const spendByDowRaw: Record<string, number[]> = {};
  for (const day of DAYS) {
    guestsByDowRaw[day] = [];
    spendByDowRaw[day] = [];
  }

  for (const [date, agg] of perDate.entries()) {
    if (agg.guests <= 0) continue;
    const dow = getDayName(date);
    guestsByDowRaw[dow].push(agg.guests);
    spendByDowRaw[dow].push(agg.sales / agg.guests);
  }

  const guestsByDow: Record<string, number> = {};
  const avgSpendByDow: Record<string, number> = {};
  let hasData = false;
  for (const day of DAYS) {
    guestsByDow[day] = median(guestsByDowRaw[day]);
    avgSpendByDow[day] = median(spendByDowRaw[day]);
    if (guestsByDowRaw[day].length > 0) hasData = true;
  }

  return { guestsByDow, avgSpendByDow, hasData };
}

export interface DistributedDay {
  date: string;
  day: string;
  /** Pre-scaling baseline (median guests * median avg spend, gross) */
  baselineGross: number;
  /** Final daily target gross sales (after scaling to monthly target) */
  targetGross: number;
  /** Suggested guests for this day (rounded) */
  guests: number;
  /** Suggested avg spend per guest (rounded) */
  avgSpend: number;
  /** Total sales = gross + 10% service charge */
  totalSales: number;
  /** True if median data was missing for this DOW (used even-distribution fallback) */
  fallback: boolean;
}

/**
 * Distribute a monthly gross-sales target across each day of the month
 * proportionally to the median DOW driver pattern (guests x avg spend).
 *
 * `monthlyTarget` is interpreted as TOTAL SALES (incl. 10% service charge),
 * matching the user's "target 800K this month" intent. We back out the
 * gross figure (monthlyTarget / 1.1) for distribution, then re-apply SC per day.
 */
export function distributeMonthlyTarget(params: {
  year: number;
  month: number; // 1-12
  monthlyTarget: number; // total sales target (incl SC)
  medians: MedianByDOW;
}): DistributedDay[] {
  const { year, month, monthlyTarget, medians } = params;
  const dates = getDatesInMonth(year, month);

  // Baseline per day = median guests × median avg spend (gross)
  const baselines = dates.map((d) => {
    const dow = DAYS[d.getDay()];
    const g = medians.guestsByDow[dow] || 0;
    const s = medians.avgSpendByDow[dow] || 0;
    const baseline = g * s;
    return { date: d, dow, guests: g, avgSpend: s, baseline };
  });

  const totalBaseline = baselines.reduce((sum, b) => sum + b.baseline, 0);
  const grossTarget = monthlyTarget / 1.1;

  // Scale factor: maps baseline gross → target gross
  const useFallback = !medians.hasData || totalBaseline <= 0;
  const evenShare = grossTarget / dates.length;

  return baselines.map((b) => {
    let targetGross: number;
    let guests: number;
    let avgSpend: number;
    let fallback = false;

    if (useFallback || b.baseline <= 0) {
      targetGross = evenShare;
      // Reasonable defaults: pick overall median guests & spend, else split evenly
      const allG = Object.values(medians.guestsByDow).filter((v) => v > 0);
      const allS = Object.values(medians.avgSpendByDow).filter((v) => v > 0);
      const fallbackGuests = allG.length ? allG.reduce((a, c) => a + c, 0) / allG.length : 0;
      const fallbackSpend = allS.length ? allS.reduce((a, c) => a + c, 0) / allS.length : 0;
      avgSpend = fallbackSpend > 0 ? Math.round(fallbackSpend) : 0;
      guests = avgSpend > 0 ? Math.round(targetGross / avgSpend) : Math.round(fallbackGuests);
      fallback = true;
    } else {
      const scale = grossTarget / totalBaseline;
      targetGross = b.baseline * scale;
      // Keep avg spend equal to DOW median (realistic), scale guests to hit target
      avgSpend = Math.round(b.avgSpend);
      guests = avgSpend > 0 ? Math.round(targetGross / avgSpend) : 0;
    }

    const grossSales = guests * avgSpend;
    const serviceCharge = Math.round(grossSales * 0.1);
    const totalSales = grossSales + serviceCharge;

    return {
      date: toIsoDate(b.date),
      day: DAYS[b.date.getDay()],
      baselineGross: b.baseline,
      targetGross,
      guests,
      avgSpend,
      totalSales,
      fallback,
    };
  });
}
