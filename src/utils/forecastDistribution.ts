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

export interface VenueWeights {
  /** venue → share fraction (sums to 1 across venues with history) */
  weights: Record<string, number>;
  /** venues that had zero historical revenue in the lookback window */
  venuesWithoutHistory: string[];
  /** True if NO selected venue had any history (caller should fall back to equal split) */
  allMissing: boolean;
}

/**
 * Compute each venue's share of total revenue across the selected venues,
 * based on the last `lookbackMonths` of sales. Venues with zero history get 0.
 * If all venues lack history, returns equal weights and `allMissing = true`.
 */
export function computeVenueWeights(
  salesData: { date: string; venue: string; totalSales: number }[],
  venues: string[],
  lookbackMonths = 3,
): VenueWeights {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const cutoffIso = toIsoDate(cutoff);

  const totals: Record<string, number> = {};
  for (const v of venues) totals[v] = 0;
  for (const s of salesData) {
    if (!venues.includes(s.venue)) continue;
    if (s.date < cutoffIso) continue;
    totals[s.venue] += s.totalSales;
  }

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const venuesWithoutHistory = venues.filter((v) => totals[v] <= 0);

  if (grand <= 0) {
    const equal = venues.length > 0 ? 1 / venues.length : 0;
    const weights: Record<string, number> = {};
    for (const v of venues) weights[v] = equal;
    return { weights, venuesWithoutHistory: venues.slice(), allMissing: true };
  }

  const weights: Record<string, number> = {};
  for (const v of venues) weights[v] = totals[v] / grand;
  return { weights, venuesWithoutHistory, allMissing: false };
}

/**
 * Compute a single global median average-spend-per-guest across the selected
 * venues, considering all historical sales since `sinceIso` (inclusive).
 * Spend is computed per (venue, date) row as totalSales/1.1/guests (gross spend).
 */
export function computeGlobalMedianSpend(
  salesData: { date: string; venue: string; guests: number; totalSales: number }[],
  venues: string[],
  sinceIso: string,
): number {
  const spends: number[] = [];
  for (const s of salesData) {
    if (!venues.includes(s.venue)) continue;
    if (s.date < sinceIso) continue;
    if (s.guests <= 0 || s.totalSales <= 0) continue;
    spends.push(s.totalSales / 1.1 / s.guests);
  }
  return median(spends);
}

/** Default "since" cutoff: most recent past October 1st (YYYY-10-01). */
export function getDefaultSinceOctober(today = new Date()): string {
  const y = today.getMonth() + 1 >= 10 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-10-01`;
}

/**
 * Distribute a monthly TOTAL-SALES target across each day of the month using a
 * UNIFORM avg-spend-per-guest (`flatSpend`). Daily revenue allocation still
 * follows the DOW guest-median shape (so busier days get more revenue), but
 * guests are derived as revenue / flatSpend so the spend-per-guest is constant.
 *
 * Past days with actuals are kept untouched.
 */
export function distributeMonthlyTargetFlatSpend(params: {
  year: number;
  month: number;
  monthlyTarget: number;
  flatSpend: number;
  /** DOW → median guests, used only as a SHAPE for distributing daily revenue */
  dowGuestsForShape: Record<string, number>;
  actuals?: Map<string, { guests: number; totalSales: number }>;
}): DistributionResult {
  const { year, month, monthlyTarget, flatSpend, dowGuestsForShape, actuals } = params;
  const dates = getDatesInMonth(year, month);

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

  // Shape weights (DOW guest medians). If empty/zero → equal share.
  const shapeWeights = remainingDays.map((s) => {
    const dow = DAYS[s.date.getDay()];
    return Math.max(0, dowGuestsForShape[dow] || 0);
  });
  const totalShape = shapeWeights.reduce((a, b) => a + b, 0);
  const useEven = totalShape <= 0;
  const evenShare = remainingDays.length > 0 ? remainingGrossTarget / remainingDays.length : 0;

  const safeFlatSpend = flatSpend > 0 ? Math.round(flatSpend) : 0;

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

    const idx = remainingDays.findIndex((x) => x.iso === s.iso);
    const targetGross = useEven
      ? evenShare
      : (shapeWeights[idx] / totalShape) * remainingGrossTarget;

    const guests = safeFlatSpend > 0 ? Math.round(targetGross / safeFlatSpend) : 0;
    const grossSales = guests * safeFlatSpend;
    const serviceCharge = Math.round(grossSales * 0.1);
    return {
      date: s.iso,
      day: DAYS[s.date.getDay()],
      guests,
      avgSpend: safeFlatSpend,
      totalSales: grossSales + serviceCharge,
      fallback: useEven || safeFlatSpend === 0,
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

