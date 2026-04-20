import { SalesRecord } from "@/types/sales";
import {
  computeDowMedians,
  computeVenueWeights,
  distributeMonthlyTarget,
  aggregateActualsByVenue,
  DistributedDay,
} from "./forecastDistribution";

export type ForecastVenue = "Assembly" | "Caliente" | "Hanabi" | "Events";

export interface ForecastTableRow extends DistributedDay {
  /** Target avg-spend-per-guest from DOW median (the spend baseline used for forecast) */
  targetSpend: number;
}

export interface VenueTableData {
  venue: ForecastVenue;
  rows: ForecastTableRow[];
  venueTarget: number;
  weightPct: number;
  noHistory: boolean;
  actualSoFar: number;
  forecastTotal: number;
  combinedTotal: number;
}

export interface ForecastTableData {
  perVenue: VenueTableData[];
  combined: {
    rows: ForecastTableRow[];
    actualSoFar: number;
    forecastTotal: number;
    combinedTotal: number;
  };
}

/**
 * Build forecast table rows mirroring the "Daily Distribution" logic exactly.
 * Distributes a monthly revenue target across venues (by historical share) and
 * across days (by DOW median guests × avg spend), preserving any actuals.
 */
export function buildForecastTableData(params: {
  year: number;
  month: number;
  venues: ForecastVenue[];
  salesData: SalesRecord[];
  monthlyTarget: number;
}): ForecastTableData {
  const { year, month, venues, salesData, monthlyTarget } = params;

  const { weights, venuesWithoutHistory, allMissing } = computeVenueWeights(
    salesData,
    venues,
    3
  );

  const perVenue: VenueTableData[] = venues.map((venue) => {
    const weight = weights[venue] ?? 0;
    const venueTarget = monthlyTarget * weight;
    const medians = computeDowMedians(salesData, [venue], 3);
    const actuals = aggregateActualsByVenue(salesData, venue, year, month);
    const result = distributeMonthlyTarget({
      year,
      month,
      monthlyTarget: venueTarget,
      medians,
      actuals,
    });

    // Enrich each row with target avg spend (the DOW median spend used as baseline)
    const rows: ForecastTableRow[] = result.rows.map((r) => {
      const dowName = new Date(r.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
      });
      const targetSpend = Math.round(medians.avgSpendByDow[dowName] || r.avgSpend || 0);
      return { ...r, targetSpend };
    });

    return {
      venue,
      rows,
      venueTarget,
      weightPct: Math.round(weight * 1000) / 10,
      noHistory: !allMissing && venuesWithoutHistory.includes(venue),
      actualSoFar: result.actualSoFar,
      forecastTotal: result.forecastTotal,
      combinedTotal: result.combinedTotal,
    };
  });

  // Combined: aggregate by date across all venues
  const byDate = new Map<string, ForecastTableRow>();
  for (const v of perVenue) {
    for (const r of v.rows) {
      const cur = byDate.get(r.date);
      if (!cur) {
        byDate.set(r.date, { ...r });
      } else {
        cur.guests += r.guests;
        cur.totalSales += r.totalSales;
        // weighted avg spend (gross)
        cur.avgSpend = cur.guests > 0 ? Math.round(cur.totalSales / 1.1 / cur.guests) : 0;
        cur.targetSpend = cur.guests > 0
          ? Math.round(((cur.targetSpend * (cur.guests - r.guests)) + (r.targetSpend * r.guests)) / cur.guests)
          : r.targetSpend;
        if (!r.isActual && cur.isActual) cur.isActual = false;
      }
    }
  }
  const combinedRows = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const combinedActual = perVenue.reduce((s, v) => s + v.actualSoFar, 0);
  const combinedForecast = perVenue.reduce((s, v) => s + v.forecastTotal, 0);

  return {
    perVenue,
    combined: {
      rows: combinedRows,
      actualSoFar: combinedActual,
      forecastTotal: combinedForecast,
      combinedTotal: combinedActual + combinedForecast,
    },
  };
}
