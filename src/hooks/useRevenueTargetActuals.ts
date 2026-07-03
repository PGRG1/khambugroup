import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { ActualDailyRow, ActualCoverage } from "@/types/revenueTargetsV2";

export interface PeriodActual {
  revenue: number;
  guests: number;
  spendPerGuest: number | null;
}

/**
 * Actuals hook for Revenue Targets v2.
 * - `rows` = full-day totals per (venue, date), unchanged from before. Aggregates
 *   every sales_records row for that day regardless of service_period_id tag.
 * - `byPeriod` = per-period totals for tagged rows only (service_period_id NOT NULL).
 *   Keyed by `${venueId}__${date}__${servicePeriodId}`. Untagged rows are excluded.
 */
export function useRevenueTargetActuals(year: number, month: number, venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<ActualDailyRow[]>([]);
  const [byPeriod, setByPeriod] = useState<Map<string, PeriodActual>>(new Map());
  const [coverage] = useState<ActualCoverage>("full_day_only");
  const [loading, setLoading] = useState(true);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  })();
  const scopeKey = (venueIds ?? []).join(",");

  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setByPeriod(new Map()); setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from("sales_records")
      .select("venue_id, date, total_sales, guests, service_period_id")
      .eq("tenant_id", tenantId)
      .gte("date", monthStart)
      .lte("date", monthEnd);
    if (venueIds && venueIds.length) q = q.in("venue_id", venueIds);
    const { data, error } = await q;
    if (error || !data) { setRows([]); setByPeriod(new Map()); setLoading(false); return; }

    const agg = new Map<string, { venueId: string; date: string; revenue: number; guests: number }>();
    const perPeriod = new Map<string, { revenue: number; guests: number }>();
    for (const r of data as any[]) {
      if (!r.venue_id) continue;
      const date = String(r.date).slice(0, 10);
      const rev = Number(r.total_sales ?? 0);
      const g = Number(r.guests ?? 0);
      const key = `${r.venue_id}__${date}`;
      const cur = agg.get(key) ?? { venueId: r.venue_id, date, revenue: 0, guests: 0 };
      cur.revenue += rev;
      cur.guests += g;
      agg.set(key, cur);
      if (r.service_period_id) {
        const pk = `${r.venue_id}__${date}__${r.service_period_id}`;
        const cp = perPeriod.get(pk) ?? { revenue: 0, guests: 0 };
        cp.revenue += rev;
        cp.guests += g;
        perPeriod.set(pk, cp);
      }
    }
    const out: ActualDailyRow[] = Array.from(agg.values()).map((r) => ({
      venueId: r.venueId,
      targetDate: r.date,
      revenue: r.revenue,
      guests: r.guests,
      spendPerGuest: r.guests > 0 ? r.revenue / r.guests : null,
      coverage: "full_day_only" as ActualCoverage,
    }));
    const outPeriod = new Map<string, PeriodActual>();
    for (const [k, v] of perPeriod) {
      outPeriod.set(k, {
        revenue: v.revenue,
        guests: v.guests,
        spendPerGuest: v.guests > 0 ? v.revenue / v.guests : null,
      });
    }
    setRows(out);
    setByPeriod(outPeriod);
    setLoading(false);
  }, [tenantId, monthStart, monthEnd, scopeKey]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  /** Look up per-period actuals for a tagged (venue, date, period). Returns null when untagged / no data. */
  const getServicePeriodActual = useCallback(
    (venueId: string, date: string, servicePeriodId: string): PeriodActual | null =>
      byPeriod.get(`${venueId}__${date}__${servicePeriodId}`) ?? null,
    [byPeriod],
  );

  return { rows, byPeriod, coverage, loading, refetch: fetchRows, getServicePeriodActual };
}
