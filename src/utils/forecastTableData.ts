import { SalesRecord } from "@/types/sales";
import {
  computeDowMedians,
  distributeMonthlyTargetUniformSpendDowShape,
  meanOfDowMedianSpend,
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
 * Daily revenue is shaped by the SAME driver as the Daily Distribution modal:
 * per-DOW median guests × per-DOW median spend. The displayed Avg Target
 * is the arithmetic mean of the 7 DOW median spends, applied uniformly to
 * every forecast row, with guests back-solved as dailyGross / flatSpend.
 * Actuals are preserved as-is.
 */
export function buildForecastTableData(params: {
  year: number;
  month: number;
  venues: ForecastVenue[];
  salesData: SalesRecord[];
  monthlyTarget: number;
}): ForecastTableData {
  const { year, month, venues, salesData, monthlyTarget } = params;

  const dowMedians = computeDowMedians(salesData, venues, 12);
  const flatSpend = meanOfDowMedianSpend(dowMedians);

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

  const result = distributeMonthlyTargetUniformSpendDowShape({
    year,
    month,
    monthlyTarget,
    flatSpend,
    medians: dowMedians,
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
