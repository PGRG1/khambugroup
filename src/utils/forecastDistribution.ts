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
  /** Suggested guests for this day (rounded) */
  guests: number;
  /** Suggested avg spend per guest (rounded) */
  avgSpend: number;
  /** Total sales = gross + 10% service charge */
  totalSales: number;
  /** True if median data was missing for this DOW (used even-distribution fallback) */
  fallback: boolean;
  /** True if this date is in the past and the row reflects ACTUAL recorded sales (not a forecast) */
  isActual: boolean;
}

export interface DistributionResult {
  rows: DistributedDay[];
  actualSoFar: number;        // sum of actual total sales already in the month for selected venues
  remainingTarget: number;    // monthlyTarget - actualSoFar (total sales)
  forecastTotal: number;      // sum of forecasted total sales for remaining days
  combinedTotal: number;      // actualSoFar + forecastTotal
}

/**
 * Distribute a monthly TOTAL-SALES target across each day of the month.
 *
 * Past days where actuals already exist are kept as-is (not re-forecasted).
 * The remaining target (= monthly target − actual so far) is distributed across
 * the remaining future days using the DOW median driver pattern.
 *
 * `monthlyTarget` is total sales (incl. 10% service charge).
 */
export function distributeMonthlyTarget(params: {
  year: number;
  month: number; // 1-12
  monthlyTarget: number;
  medians: MedianByDOW;
  /** Map of date (yyyy-mm-dd) → aggregated actuals across selected venues */
  actuals?: Map<string, { guests: number; totalSales: number }>;
}): DistributionResult {
  const { year, month, monthlyTarget, medians, actuals } = params;
  const dates = getDatesInMonth(year, month);

  // 1. Split into "actual" days vs "remaining" days
  let actualSoFar = 0;
  const splitDays = dates.map((d) => {
    const iso = toIsoDate(d);
    const a = actuals?.get(iso);
    if (a && a.totalSales > 0) {
      actualSoFar += a.totalSales;
      return { date: d, iso, isActual: true, actual: a };
    }
    return { date: d, iso, isActual: false, actual: null as null | { guests: number; totalSales: number } };
  });

  const remainingDays = splitDays.filter((s) => !s.isActual);
  const remainingTarget = Math.max(0, monthlyTarget - actualSoFar);
  const remainingGrossTarget = remainingTarget / 1.1;

  // 2. Compute baselines for remaining days only
  const baselines = remainingDays.map((s) => {
    const dow = DAYS[s.date.getDay()];
    const g = medians.guestsByDow[dow] || 0;
    const sp = medians.avgSpendByDow[dow] || 0;
    return { ...s, dow, mGuests: g, mSpend: sp, baseline: g * sp };
  });

  const totalBaseline = baselines.reduce((sum, b) => sum + b.baseline, 0);
  const useFallback = !medians.hasData || totalBaseline <= 0;
  const evenShare = remainingDays.length > 0 ? remainingGrossTarget / remainingDays.length : 0;
  const baselineToGross = totalBaseline > 0 ? remainingGrossTarget / totalBaseline : 0;

  // Pre-compute fallback defaults
  const allG = Object.values(medians.guestsByDow).filter((v) => v > 0);
  const allS = Object.values(medians.avgSpendByDow).filter((v) => v > 0);
  const avgFallbackSpend = allS.length ? allS.reduce((a, c) => a + c, 0) / allS.length : 0;
  const avgFallbackGuests = allG.length ? allG.reduce((a, c) => a + c, 0) / allG.length : 0;

  // 3. Build full row list preserving date order
  const rows: DistributedDay[] = splitDays.map((s) => {
    if (s.isActual && s.actual) {
      const guests = s.actual.guests;
      const avgSpend = guests > 0 ? Math.round(s.actual.totalSales / 1.1 / guests) : 0;
      return {
        date: s.iso,
        day: DAYS[s.date.getDay()],
        guests,
        avgSpend,
        totalSales: Math.round(s.actual.totalSales),
        fallback: false,
        isActual: true,
      };
    }

    const b = baselines.find((x) => x.iso === s.iso)!;
    let targetGross: number;
    let guests: number;
    let avgSpend: number;
    let fallback = false;

    if (useFallback || b.baseline <= 0) {
      targetGross = evenShare;
      avgSpend = avgFallbackSpend > 0 ? Math.round(avgFallbackSpend) : 0;
      guests = avgSpend > 0 ? Math.round(targetGross / avgSpend) : Math.round(avgFallbackGuests);
      fallback = true;
    } else {
      targetGross = b.baseline * baselineToGross;
      avgSpend = Math.round(b.mSpend);
      guests = avgSpend > 0 ? Math.round(targetGross / avgSpend) : 0;
    }

    const grossSales = guests * avgSpend;
    const serviceCharge = Math.round(grossSales * 0.1);
    return {
      date: s.iso,
      day: DAYS[s.date.getDay()],
      guests,
      avgSpend,
      totalSales: grossSales + serviceCharge,
      fallback,
      isActual: false,
    };
  });

  const forecastTotal = rows.filter((r) => !r.isActual).reduce((s, r) => s + r.totalSales, 0);

  return {
    rows,
    actualSoFar: Math.round(actualSoFar),
    remainingTarget: Math.round(remainingTarget),
    forecastTotal: Math.round(forecastTotal),
    combinedTotal: Math.round(actualSoFar + forecastTotal),
  };
}

/** Build a per-venue map of date → aggregated actuals from sales records */
export function aggregateActualsByVenue(
  salesData: { date: string; venue: string; guests: number; totalSales: number }[],
  venue: string,
  year: number,
  month: number
): Map<string, { guests: number; totalSales: number }> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const map = new Map<string, { guests: number; totalSales: number }>();
  for (const s of salesData) {
    if (s.venue !== venue) continue;
    if (!s.date.startsWith(monthStr)) continue;
    const cur = map.get(s.date) ?? { guests: 0, totalSales: 0 };
    cur.guests += s.guests;
    cur.totalSales += s.totalSales;
    map.set(s.date, cur);
  }
  return map;
}

