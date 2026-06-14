import { supabase } from "@/integrations/supabase/client";

export const AUTO_KPI_TYPES = ["daily_revenue", "daily_guests", "daily_cheques"] as const;
export type AutoKpiType = (typeof AUTO_KPI_TYPES)[number];

export function isAutoKpiType(t: string): t is AutoKpiType {
  return (AUTO_KPI_TYPES as readonly string[]).includes(t);
}

/**
 * Compute today's (or any day's) actual for an auto-pulled KPI by reading sales_records.
 * - daily_revenue → SUM(subtotal + service_charge)
 * - daily_guests  → SUM(guests)
 * - daily_cheques → SUM(orders)
 *
 * `venueName` is the canonical venue string stored in sales_records (e.g. "Assembly").
 * Pass `null` to aggregate across all venues.
 */
export async function computeAutoActual(
  kpiType: AutoKpiType,
  venueName: string | null,
  date: string,
): Promise<number> {
  let q = supabase.from("sales_records").select("subtotal,service_charge,guests,orders,date,venue").eq("date", date);
  if (venueName) q = q.eq("venue", venueName);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (kpiType === "daily_revenue") {
    return rows.reduce((s, r) => s + Number(r.subtotal ?? 0) + Number(r.service_charge ?? 0), 0);
  }
  if (kpiType === "daily_guests") {
    return rows.reduce((s, r) => s + Number(r.guests ?? 0), 0);
  }
  return rows.reduce((s, r) => s + Number(r.orders ?? 0), 0);
}

/**
 * Compute per-day actuals across a date range (inclusive) for an auto KPI.
 * Returns { 'YYYY-MM-DD': value } map. Dates with no sales are absent.
 */
export async function computeAutoActualRange(
  kpiType: AutoKpiType,
  venueName: string | null,
  fromDate: string,
  toDate: string,
): Promise<Record<string, number>> {
  let q = supabase
    .from("sales_records")
    .select("subtotal,service_charge,guests,orders,date,venue")
    .gte("date", fromDate)
    .lte("date", toDate);
  if (venueName) q = q.eq("venue", venueName);
  const { data, error } = await q;
  if (error) throw error;
  const acc: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) {
    const d = r.date as string;
    let v = 0;
    if (kpiType === "daily_revenue") v = Number(r.subtotal ?? 0) + Number(r.service_charge ?? 0);
    else if (kpiType === "daily_guests") v = Number(r.guests ?? 0);
    else v = Number(r.orders ?? 0);
    acc[d] = (acc[d] ?? 0) + v;
  }
  return acc;
}
