/**
 * Pure helpers for the standalone "New Targets" daily projection table.
 * Independent of the legacy revenue-targets logic.
 */

export type ForecastSource = "manager" | "auto" | "none";

/** Number of matching-weekday observations required for an automatic forecast. */
export const AUTO_FORECAST_LOOKBACK = 8;

export interface DailyProjectionRow {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Short weekday label, e.g. "Mon" */
  day: string;
  /** Manager override from revenue_daily_projections; null when none */
  projectedSales: number | null;
  /** Automatic same-weekday average; null when fewer than 8 observations */
  autoForecast: number | null;
  /** Manager override when present, otherwise the automatic forecast */
  effectiveForecast: number | null;
  /** Where effectiveForecast came from */
  forecastSource: ForecastSource;
  /** Aggregated real sales; null when no sales record exists for that day */
  actualSales: number | null;
  /** actualSales - effectiveForecast; null when either is missing */
  variance: number | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** ISO dates for every calendar day of the given month (1-indexed month). */
export function monthDates(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: days }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

export function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return DAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Sum total sales per ISO date from raw sales_records rows. */
export function aggregateActualsByDate(
  rows: Array<{ date: string | null; total_sales: number | string | null }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r?.date) continue;
    const key = String(r.date).slice(0, 10);
    out.set(key, (out.get(key) ?? 0) + Number(r.total_sales ?? 0));
  }
  return out;
}

export function computeVariance(actual: number | null, projected: number | null): number | null {
  if (actual === null || actual === undefined) return null;
  if (projected === null || projected === undefined) return null;
  return actual - projected;
}

/**
 * Simple average of the most recent `AUTO_FORECAST_LOOKBACK` available sales
 * dates strictly BEFORE `targetDate` that share its weekday.
 * Dates without a sales record are skipped; a record with 0 is a valid
 * observation. Returns null when fewer than 8 observations exist.
 */
export function computeAutoForecast(
  targetDate: string,
  salesByDate: Map<string, number>,
  lookback: number = AUTO_FORECAST_LOOKBACK,
): number | null {
  const targetDow = dayLabel(targetDate);
  const candidates = Array.from(salesByDate.keys())
    .filter((d) => d < targetDate && dayLabel(d) === targetDow)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, lookback);
  if (candidates.length < lookback) return null;
  const sum = candidates.reduce((acc, d) => acc + Number(salesByDate.get(d) ?? 0), 0);
  return sum / lookback;
}

/** Build one row per calendar day of the selected month. */
export function buildProjectionRows(
  year: number,
  month: number,
  projections: Map<string, number>,
  actuals: Map<string, number>,
  history?: Map<string, number>,
): DailyProjectionRow[] {
  const salesByDate = history ?? actuals;
  return monthDates(year, month).map((date) => {
    const projectedSales = projections.has(date) ? Number(projections.get(date)) : null;
    const actualSales = actuals.has(date) ? Number(actuals.get(date)) : null;
    const autoForecast = computeAutoForecast(date, salesByDate);
    const effectiveForecast = projectedSales !== null ? projectedSales : autoForecast;
    const forecastSource: ForecastSource =
      projectedSales !== null ? "manager" : autoForecast !== null ? "auto" : "none";
    return {
      date,
      day: dayLabel(date),
      projectedSales,
      autoForecast,
      effectiveForecast,
      forecastSource,
      actualSales,
      variance: computeVariance(actualSales, effectiveForecast),
    };
  });
}

/** HK$ with comma separators and 2 decimals. Returns "—" for null. */
export function formatHkd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `HK$ ${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Editable forecast display with comma separators and exactly 2 decimals. */
export function formatForecastNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Validate a projected-sales input string.
 * Allows zero and decimals; rejects negatives and non-numeric text.
 * Empty input clears the value (null).
 */
export function parseProjectedInput(raw: string): { ok: boolean; value: number | null; error?: string } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  const validPlainNumber = /^\d+(?:\.\d*)?$/.test(s);
  const validThousandsNumber = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(s);
  if (!validPlainNumber && !validThousandsNumber) {
    return { ok: false, value: null, error: "Enter a number of 0 or more" };
  }
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { ok: false, value: null, error: "Enter a number of 0 or more" };
  if (n < 0) return { ok: false, value: null, error: "Negative values are not allowed" };
  return { ok: true, value: n };
}

/** Columns of the New Targets table; only Projected Sales is editable. */
export const NEW_TARGET_COLUMNS = [
  { key: "date", label: "Date", editable: false },
  { key: "day", label: "Day", editable: false },
  { key: "forecast", label: "Forecast", editable: true },
  { key: "actualSales", label: "Actual Sales", editable: false },
  { key: "variance", label: "Variance", editable: false },
] as const;

/**
 * Split a monthly target across the month's days, weighted by each weekday's
 * historical average sales (before the month starts). Falls back to an even
 * split when there is no history. Values are rounded to cents and the last
 * day absorbs the rounding so the days add up exactly to the monthly total.
 */
export function distributeMonthlyTarget(
  total: number,
  dates: string[],
  salesByDate: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (dates.length === 0 || !Number.isFinite(total) || total < 0) return out;
  const start = dates[0];
  const sums: Record<string, { s: number; n: number }> = {};
  for (const [d, v] of salesByDate) {
    if (d >= start) continue;
    const k = dayLabel(d);
    sums[k] = sums[k] ?? { s: 0, n: 0 };
    sums[k].s += v;
    sums[k].n += 1;
  }
  const weights = dates.map((d) => {
    const w = sums[dayLabel(d)];
    return w && w.n > 0 ? Math.max(0, w.s / w.n) : 0;
  });
  const wSum = weights.reduce((a, b) => a + b, 0);
  const share = wSum > 0 ? weights.map((w) => w / wSum) : dates.map(() => 1 / dates.length);
  let allocated = 0;
  dates.forEach((d, i) => {
    const v = i === dates.length - 1
      ? Math.round((total - allocated) * 100) / 100
      : Math.round(total * share[i] * 100) / 100;
    allocated += v;
    out.set(d, v);
  });
  return out;
}

export interface TargetSummary {
  target: number;
  actual: number;
  /** Target for days up to and including the last day with sales. */
  targetToDate: number;
  pace: number;
  /** Target still to do divided by remaining days; null when month is over. */
  runRateNeeded: number | null;
  remainingDays: number;
  projected: number | null;
}

/** Month-level pacing from projection rows. `today` is an ISO date. */
export function summarizeTargets(rows: DailyProjectionRow[], today: string): TargetSummary {
  const target = rows.reduce((a, r) => a + (r.effectiveForecast ?? 0), 0);
  const actual = rows.reduce((a, r) => a + (r.actualSales ?? 0), 0);
  const lastActual = rows.filter((r) => r.actualSales !== null).map((r) => r.date).pop() ?? null;
  const targetToDate = lastActual
    ? rows.filter((r) => r.date <= lastActual).reduce((a, r) => a + (r.effectiveForecast ?? 0), 0)
    : 0;
  const cutoff = lastActual && lastActual > today ? lastActual : today;
  const remaining = rows.filter((r) => r.date > cutoff && r.actualSales === null).length;
  const elapsed = lastActual ? rows.filter((r) => r.date <= lastActual).length : 0;
  return {
    target,
    actual,
    targetToDate,
    pace: actual - targetToDate,
    runRateNeeded: remaining > 0 ? Math.max(0, target - actual) / remaining : null,
    remainingDays: remaining,
    projected: elapsed > 0 ? (actual / elapsed) * rows.length : null,
  };
}
