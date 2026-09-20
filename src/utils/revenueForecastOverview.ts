/**
 * Pure logic for the Revenue Overview "Forecast" summary.
 *
 * Reuses the New Targets daily forecast (manager override in
 * revenue_daily_projections, otherwise the 8 same-weekday auto forecast) via
 * buildProjectionRows. Each venue is forecast independently and the effective
 * daily forecasts are summed — never forecast the combined portfolio.
 */

import { buildProjectionRows } from "./dailyProjections";

export interface ForecastVenueInput {
  venueId: string;
  venueName: string;
  /** All sales history for this venue keyed by ISO date (should include past months). */
  salesByDate: Map<string, number>;
  /** Manager overrides for the comparison month keyed by ISO date. */
  projections: Map<string, number>;
}

export type ForecastOverviewStatus = "ok" | "incomplete" | "unavailable";

export interface ForecastOverviewDay {
  date: string;
  actual: number;
  forecast: number | null;
  variance: number | null;
  variancePct: number | null;
  scopedVenueCount: number;
  forecastedVenueCount: number;
}

export interface ForecastOverviewSummary {
  status: ForecastOverviewStatus;
  /** Short machine reason for non-ok states. */
  reason?: "multi-month" | "no-range" | "no-venues" | "missing-forecast";
  forecastTotal: number | null;
  actualComparable: number | null;
  variance: number | null;
  variancePct: number | null;
  scopedVenueDays: number;
  forecastedVenueDays: number;
  /** Inclusive comparison window, ISO dates. */
  comparisonFrom: string | null;
  comparisonTo: string | null;
  /** Daily values produced from the same per-venue projection rows as the totals. */
  daily: ForecastOverviewDay[];
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ComparisonWindow {
  ok: boolean;
  reason?: "multi-month" | "no-range";
  from: string;
  to: string;
  year: number;
  month: number;
}

/**
 * Resolve the comparison window: must sit inside one calendar month, and the
 * end is clamped to `today` so future days never make actuals look behind.
 */
export function resolveComparisonWindow(
  from: Date | undefined,
  to: Date | undefined,
  today: Date,
): ComparisonWindow {
  const empty = { from: "", to: "", year: 0, month: 0 };
  if (!from || !to) return { ok: false, reason: "no-range", ...empty };
  if (from.getFullYear() !== to.getFullYear() || from.getMonth() !== to.getMonth()) {
    return { ok: false, reason: "multi-month", ...empty };
  }
  const fromIso = toIsoDate(from);
  let toIso = toIsoDate(to);
  const todayIso = toIsoDate(today);
  if (toIso > todayIso) toIso = todayIso;
  if (toIso < fromIso) return { ok: false, reason: "no-range", ...empty };
  return {
    ok: true,
    from: fromIso,
    to: toIso,
    year: from.getFullYear(),
    month: from.getMonth() + 1,
  };
}

export function emptySummary(
  status: ForecastOverviewStatus,
  reason?: ForecastOverviewSummary["reason"],
): ForecastOverviewSummary {
  return {
    status,
    reason,
    forecastTotal: null,
    actualComparable: null,
    variance: null,
    variancePct: null,
    scopedVenueDays: 0,
    forecastedVenueDays: 0,
    comparisonFrom: null,
    comparisonTo: null,
    daily: [],
  };
}

export function computeForecastOverview(args: {
  venues: ForecastVenueInput[];
  from: Date | undefined;
  to: Date | undefined;
  today: Date;
  /**
   * When true (the "All Venues" aggregate), venues with neither any sales
   * history nor any manager projections are excluded from scope — an active
   * but unused venue must not blank the whole summary. When false (a venue
   * was explicitly selected), empty venues stay in scope and surface as
   * incomplete instead of being silently ignored.
   */
  excludeEmptyVenues?: boolean;
}): ForecastOverviewSummary {
  const win = resolveComparisonWindow(args.from, args.to, args.today);
  if (!win.ok) return emptySummary("unavailable", win.reason);
  const venues = args.excludeEmptyVenues
    ? args.venues.filter((v) => v.salesByDate.size > 0 || v.projections.size > 0)
    : args.venues;
  if (venues.length === 0) return emptySummary("unavailable", "no-venues");

  let forecastTotal = 0;
  let actualComparable = 0;
  let scopedVenueDays = 0;
  let forecastedVenueDays = 0;
  const dailyByDate = new Map<string, {
    actual: number;
    knownForecast: number;
    scopedVenueCount: number;
    forecastedVenueCount: number;
  }>();

  for (const v of venues) {
    const monthActuals = new Map<string, number>();
    const monthStart = `${win.year}-${String(win.month).padStart(2, "0")}-01`;
    for (const [d, amount] of v.salesByDate) {
      if (d >= monthStart && d.slice(0, 7) === monthStart.slice(0, 7)) monthActuals.set(d, amount);
    }
    const rows = buildProjectionRows(win.year, win.month, v.projections, monthActuals, v.salesByDate);
    for (const row of rows) {
      if (row.date < win.from || row.date > win.to) continue;
      const day = dailyByDate.get(row.date) ?? {
        actual: 0,
        knownForecast: 0,
        scopedVenueCount: 0,
        forecastedVenueCount: 0,
      };
      scopedVenueDays += 1;
      day.scopedVenueCount += 1;
      if (row.effectiveForecast !== null) {
        forecastedVenueDays += 1;
        forecastTotal += row.effectiveForecast;
        day.forecastedVenueCount += 1;
        day.knownForecast += row.effectiveForecast;
      }
      const actual = row.actualSales ?? 0;
      actualComparable += actual;
      day.actual += actual;
      dailyByDate.set(row.date, day);
    }
  }

  const daily: ForecastOverviewDay[] = [...dailyByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => {
      const forecast =
        day.scopedVenueCount > 0 && day.forecastedVenueCount === day.scopedVenueCount
          ? day.knownForecast
          : null;
      const variance = forecast === null ? null : day.actual - forecast;
      return {
        date,
        actual: day.actual,
        forecast,
        variance,
        variancePct: forecast !== null && forecast !== 0 ? (variance / forecast) * 100 : null,
        scopedVenueCount: day.scopedVenueCount,
        forecastedVenueCount: day.forecastedVenueCount,
      };
    });

  const complete = scopedVenueDays > 0 && forecastedVenueDays === scopedVenueDays;
  if (!complete) {
    return {
      status: "incomplete",
      reason: "missing-forecast",
      forecastTotal,
      actualComparable,
      variance: null,
      variancePct: null,
      scopedVenueDays,
      forecastedVenueDays,
      comparisonFrom: win.from,
      comparisonTo: win.to,
      daily,
    };
  }

  const variance = actualComparable - forecastTotal;
  return {
    status: "ok",
    forecastTotal,
    actualComparable,
    variance,
    variancePct: forecastTotal !== 0 ? (variance / forecastTotal) * 100 : null,
    scopedVenueDays,
    forecastedVenueDays,
    comparisonFrom: win.from,
    comparisonTo: win.to,
    daily,
  };
}
