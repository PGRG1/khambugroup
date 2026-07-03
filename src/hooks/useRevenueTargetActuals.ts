import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { ActualDailyRow, ActualCoverage } from "@/types/revenueTargetsV2";

/**
 * Actuals hook for Revenue Targets v2.
 * Current source: sales_records — Full-Day totals per (venue, date).
 * Coverage is always 'full_day_only'. Service-period Actuals are NOT synthesized
 * from Full-Day totals. Callers must not distribute these values across periods.
 */
export function useRevenueTargetActuals(year: number, month: number, venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<ActualDailyRow[]>([]);
  const [coverage] = useState<ActualCoverage>("full_day_only");
  const [loading, setLoading] = useState(true);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  })();
  const scopeKey = (venueIds ?? []).join(",");

  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from("sales_records")
      .select("venue_id, date, total_sales, guests")
      .eq("tenant_id", tenantId)
      .gte("date", monthStart)
      .lte("date", monthEnd);
    if (venueIds && venueIds.length) q = q.in("venue_id", venueIds);
    const { data, error } = await q;
    if (error || !data) { setRows([]); setLoading(false); return; }
    // Aggregate to (venue, date). sales_records may have multiple rows per day.
    const agg = new Map<string, { venueId: string; date: string; revenue: number; guests: number }>();
    for (const r of data as any[]) {
      if (!r.venue_id) continue;
      const date = String(r.date).slice(0, 10);
      const key = `${r.venue_id}__${date}`;
      const cur = agg.get(key) ?? { venueId: r.venue_id, date, revenue: 0, guests: 0 };
      cur.revenue += Number(r.total_sales ?? 0);
      cur.guests += Number(r.guests ?? 0);
      agg.set(key, cur);
    }
    const out: ActualDailyRow[] = Array.from(agg.values()).map((r) => ({
      venueId: r.venueId,
      targetDate: r.date,
      revenue: r.revenue,
      guests: r.guests,
      spendPerGuest: r.guests > 0 ? r.revenue / r.guests : null,
      coverage: "full_day_only" as ActualCoverage,
    }));
    setRows(out);
    setLoading(false);
  }, [tenantId, monthStart, monthEnd, scopeKey]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  /** Explicit accessor: service-period Actuals are unavailable with the current source. */
  const getServicePeriodActual = useCallback((_venueId: string, _date: string, _servicePeriodId: string): {
    coverage: "unavailable";
  } => ({ coverage: "unavailable" }), []);

  return { rows, coverage, loading, refetch: fetchRows, getServicePeriodActual };
}
