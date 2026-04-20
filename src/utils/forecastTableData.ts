import { SalesRecord } from "@/types/sales";
import {
  computeDowMedians,
  distributeMonthlyTargetUniformSpendDowShape,
  meanOfDowMedianSpend,
  computeVenueWeights,
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
  /** The portion of monthlyTarget allocated to the selected venues */
  scopedTarget: number;
  actualSoFar: number;
  forecastTotal: number;
  combinedTotal: number;
  hasHistory: boolean;
  /** Selected venues that are NOT covered by the saved target's venue scope */
  unallocatedVenues: ForecastVenue[];
}

/**
 * Build a single combined forecast table for the selected venues.
 *
 * The monthly target belongs to a specific set of venues (`targetVenues`).
 * When the user selects a subset, we proportionally scope the target using
 * each venue's historical revenue share (mirrors the Daily Distribution modal).
 */
export function buildForecastTableData(params: {
  year: number;
  month: number;
  venues: ForecastVenue[];
  salesData: SalesRecord[];
  monthlyTarget: number;
  /** Venues the saved monthly target was set for (e.g. ["Assembly","Caliente"]) */
  targetVenues: ForecastVenue[];
}): ForecastTableData {
  const { year, month, venues, salesData, monthlyTarget, targetVenues } = params;

  const dowMedians = computeDowMedians(salesData, venues, 12);
  const flatSpend = meanOfDowMedianSpend(dowMedians);

  // Determine the share of the monthly target allocated to the selected venues.
  // Weights are computed across the target's owning venue set so they sum to 1.
  let scopedTarget = 0;
  const unallocatedVenues: ForecastVenue[] = [];
  if (targetVenues.length > 0 && monthlyTarget > 0) {
    const inScope = venues.filter((v) => targetVenues.includes(v));
    unallocatedVenues.push(...venues.filter((v) => !targetVenues.includes(v)));

    if (inScope.length > 0) {
      const { weights } = computeVenueWeights(salesData, targetVenues, 3);
      const shareSum = inScope.reduce((s, v) => s + (weights[v] ?? 0), 0);
      scopedTarget = monthlyTarget * shareSum;
    }
  } else if (monthlyTarget > 0 && targetVenues.length === 0) {
    // Backwards compat: no targetVenues recorded → assume target applies to selection as-is
    scopedTarget = monthlyTarget;
  }

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
    monthlyTarget: scopedTarget,
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
    scopedTarget,
    actualSoFar: result.actualSoFar,
    forecastTotal: result.forecastTotal,
    combinedTotal: result.combinedTotal,
    hasHistory: dowMedians.hasData && flatSpend > 0,
    unallocatedVenues,
  };
}
