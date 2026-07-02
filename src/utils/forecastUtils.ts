import { ForecastRecord, ForecastWithActuals } from "@/types/forecast";
import { SalesRecord } from "@/types/sales";

const FORECAST_KEY = "khambu_forecast_data";

export function loadForecasts(): ForecastRecord[] {
  try {
    const stored = localStorage.getItem(FORECAST_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveForecasts(data: ForecastRecord[]) {
  localStorage.setItem(FORECAST_KEY, JSON.stringify(data));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function getDayFromDate(dateStr: string): string {
  const d = new Date(dateStr);
  return days[(d.getDay() + 6) % 7];
}

export function calculateForecast(customers: number, avgSpend: number) {
  const grossSales = customers * avgSpend;
  const serviceCharge = Math.round(grossSales * 0.1);
  const totalSales = grossSales + serviceCharge;
  return { grossSales, serviceCharge, totalSales };
}

export function mergeWithActuals(
  forecasts: ForecastRecord[],
  salesData: SalesRecord[]
): ForecastWithActuals[] {
  const forecastDates = new Set(forecasts.map((f) => `${f.date}|${f.venue}`));

  const merged: ForecastWithActuals[] = forecasts.map((f) => {
    const actuals = salesData.filter(
      (s) => s.date === f.date && s.venue === f.venue
    );

    if (actuals.length === 0) {
      return {
        ...f,
        actualCustomers: null,
        actualAvgSpend: null,
        actualTotalSales: null,
        customerVariance: null,
        avgSpendVariance: null,
        totalSalesVariance: null,
      };
    }

    const totalGuests = actuals.reduce((s, r) => s + r.guests, 0);
    const totalSales = actuals.reduce((s, r) => s + r.totalSales, 0);
    const avgSpend = totalGuests ? Math.round(totalSales / totalGuests) : 0;

    return {
      ...f,
      actualCustomers: totalGuests,
      actualAvgSpend: avgSpend,
      actualTotalSales: totalSales,
      customerVariance: totalGuests - f.forecastedCustomers,
      avgSpendVariance: avgSpend - f.forecastedAvgSpend,
      totalSalesVariance: totalSales - f.forecastedTotalSales,
    };
  });

  // Add actuals that have no matching forecast
  const actualsGrouped = new Map<string, SalesRecord[]>();
  for (const s of salesData) {
    const key = `${s.date}|${s.venue}`;
    if (!forecastDates.has(key)) {
      if (!actualsGrouped.has(key)) actualsGrouped.set(key, []);
      actualsGrouped.get(key)!.push(s);
    }
  }

  for (const [, records] of actualsGrouped) {
    const first = records[0];
    const totalGuests = records.reduce((s, r) => s + r.guests, 0);
    const totalSales = records.reduce((s, r) => s + r.totalSales, 0);
    const avgSpend = totalGuests ? Math.round(totalSales / totalGuests) : 0;

    merged.push({
      id: `actual-${first.date}-${first.venue}`,
      date: first.date,
      day: first.day,
      venue: first.venue as string,
      forecastedCustomers: 0,
      forecastedAvgSpend: 0,
      forecastedGrossSales: 0,
      forecastedServiceCharge: 0,
      forecastedTotalSales: 0,
      comment: "",
      forecastNotes: "",
      postEventNotes: "",
      pendingPostEventNotes: null,
      status: "approved",
      submittedBy: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: "",
      actualCustomers: totalGuests,
      actualAvgSpend: avgSpend,
      actualTotalSales: totalSales,
      customerVariance: null,
      avgSpendVariance: null,
      totalSalesVariance: null,
    });
  }

  return merged;
}

/**
 * Collapse multi-venue rows by date so each calendar day appears once with
 * summed forecast/actual figures. Notes are concatenated with venue tags.
 */
export function aggregateMergedByDate(rows: ForecastWithActuals[]): ForecastWithActuals[] {
  const byDate = new Map<string, ForecastWithActuals[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const out: ForecastWithActuals[] = [];
  for (const [date, group] of byDate) {
    if (group.length === 1) { out.push(group[0]); continue; }

    const fCust = group.reduce((s, r) => s + (r.forecastedCustomers || 0), 0);
    const fGross = group.reduce((s, r) => s + (r.forecastedGrossSales || 0), 0);
    const fSc = group.reduce((s, r) => s + (r.forecastedServiceCharge || 0), 0);
    const fTotal = group.reduce((s, r) => s + (r.forecastedTotalSales || 0), 0);
    const fAvg = fCust > 0 ? Math.round(fGross / fCust) : 0;

    const hasActuals = group.some((r) => r.actualTotalSales !== null);
    const aCust = hasActuals ? group.reduce((s, r) => s + (r.actualCustomers ?? 0), 0) : null;
    const aTotal = hasActuals ? group.reduce((s, r) => s + (r.actualTotalSales ?? 0), 0) : null;
    const aAvg = hasActuals && aCust && aCust > 0 ? Math.round((aTotal ?? 0) / aCust) : (hasActuals ? 0 : null);

    const tag = (r: ForecastWithActuals, txt: string) => txt ? `[${r.venue}] ${txt}` : "";
    const joinNotes = (key: "comment" | "forecastNotes" | "postEventNotes") =>
      group.map((r) => tag(r, (r as any)[key])).filter(Boolean).join(" | ");

    // Status: if any pending → pending, else if all approved → approved, else draft
    const statuses = new Set(group.filter((r) => !r.id.startsWith("actual-")).map((r) => r.status));
    const status: ForecastWithActuals["status"] = statuses.has("pending_approval")
      ? "pending_approval"
      : statuses.size === 1 && statuses.has("approved")
      ? "approved"
      : "draft";

    out.push({
      id: `agg-${date}`,
      date,
      day: group[0].day,
      venue: group[0].venue, // representative; not really used in aggregated view
      forecastedCustomers: fCust,
      forecastedAvgSpend: fAvg,
      forecastedGrossSales: fGross,
      forecastedServiceCharge: fSc,
      forecastedTotalSales: fTotal,
      comment: joinNotes("comment"),
      forecastNotes: joinNotes("forecastNotes"),
      postEventNotes: joinNotes("postEventNotes"),
      pendingPostEventNotes: null,
      status,
      submittedBy: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: group[0].createdAt,
      actualCustomers: aCust,
      actualAvgSpend: aAvg,
      actualTotalSales: aTotal,
      customerVariance: aCust !== null ? aCust - fCust : null,
      avgSpendVariance: aAvg !== null ? aAvg - fAvg : null,
      totalSalesVariance: aTotal !== null ? aTotal - fTotal : null,
    });
  }

  return out;
}