import { SalesRecord } from "@/types/sales";
import {
  computeDowMedians,
  distributeMonthlyTargetFlatSpend,
  computeGlobalMedianSpend,
  getDefaultSinceOctober,
  DistributedDay,
} from "./forecastDistribution";

export type ForecastVenue = "Assembly" | "Caliente" | "Hanabi" | "Events";

export interface ForecastTableRow extends DistributedDay {
  /** Uniform avg-target-spend per guest (same for every row) */
  targetSpend: number;
}

export interface ForecastTableData {
  rows: ForecastTableRow[];
  flatSpend: number;
  selectedVenues: ForecastVenue[];
  monthlyTarget: number;
  actualSoFar: number;
  forecastTotal: number;
  combinedTotal: number;
  hasHistory: boolean;
}

/**
 * Build a single combined forecast table for the selected venues.
 *
 * Spend baseline is a UNIFORM global median avg-spend (since most recent past
 * October), applied to every forecast day. Daily revenue is shaped by combined
 * DOW guest medians. Actuals are preserved as-is.
 */
export function buildForecastTableData(params: {
  year: number;
  month: number;
  venues: ForecastVenue[];
  salesData: SalesRecord[];
  monthlyTarget: number;
}): ForecastTableData {
  const { year, month, venues, salesData, monthlyTarget } = params;

  const since = getDefaultSinceOctober();
  const flatSpend = computeGlobalMedianSpend(salesData, venues, since);
  const dowMedians = computeDowMedians(salesData, venues, 12);

  // Aggregate actuals across the selected venues for the target month
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const actuals = new Map<string, { guests: number; totalSales: number }>();
  for (const s of salesData) {
    if (!venues.includes(s.venue)) continue;
    if (!s.date.startsWith(monthStr)) continue;
    const cur = actuals.get(s.date) ?? { guests: 0, totalSales: 0 };
    cur.guests += s.guests;
    cur.totalSales += s.totalSales;
    actuals.set(s.date, cur);
  }

  const result = distributeMonthlyTargetFlatSpend({
    year,
    month,
    monthlyTarget,
    flatSpend,
    dowGuestsForShape: dowMedians.guestsByDow,
    actuals,
  });

  const targetSpendRounded = flatSpend > 0 ? Math.round(flatSpend) : 0;
  const rows: ForecastTableRow[] = result.rows.map((r) => ({
    ...r,
    targetSpend: targetSpendRounded,
  }));

  return {
    rows,
    flatSpend: targetSpendRounded,
    selectedVenues: venues,
    monthlyTarget,
    actualSoFar: result.actualSoFar,
    forecastTotal: result.forecastTotal,
    combinedTotal: result.combinedTotal,
    hasHistory: dowMedians.hasData && flatSpend > 0,
  };
}
