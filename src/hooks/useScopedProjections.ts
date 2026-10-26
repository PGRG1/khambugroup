import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { buildProjectionRows, monthDates, type DailyProjectionRow } from "@/utils/dailyProjections";
import { combineProjectionRows } from "@/utils/revenueOverview";

/**
 * Read-only daily targets for several venues in one month, using the same
 * per-venue projection rows as the Targets page, summed by date.
 * `hasManagerTarget` is true when any chosen venue has a saved target.
 */
export function useScopedProjections(venueIds: string[], year: number, month: number, enabled = true) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const key = [...venueIds].sort().join(",");
  const [rows, setRows] = useState<DailyProjectionRow[]>([]);
  const [hasManagerTarget, setHasManagerTarget] = useState(false);
  const [loading, setLoading] = useState(true);

  const dates = useMemo(() => monthDates(year, month), [year, month]);
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];

  const load = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    if (!enabled || !tenantId || ids.length === 0 || !year || !month) {
      setRows([]); setHasManagerTarget(false); setLoading(false); return;
    }
    setLoading(true);
    const PAGE = 1000;
    const sales: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("sales_records")
        .select("venue_id, date, total_sales")
        .eq("tenant_id", tenantId)
        .in("venue_id", ids)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error || !data || data.length === 0) break;
      sales.push(...data);
      if (data.length < PAGE) break;
    }
    const { data: proj } = await supabase
      .from("revenue_daily_projections")
      .select("venue_id, target_date, projected_sales")
      .eq("tenant_id", tenantId)
      .in("venue_id", ids)
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd);

    const perVenue = ids.map((id) => {
      const history = new Map<string, number>();
      for (const r of sales) {
        if (r.venue_id !== id || !r.date) continue;
        const d = String(r.date).slice(0, 10);
        history.set(d, (history.get(d) ?? 0) + Number(r.total_sales ?? 0));
      }
      const actuals = new Map<string, number>();
      for (const [d, v] of history) if (d >= monthStart && d <= monthEnd) actuals.set(d, v);
      const projections = new Map<string, number>();
      for (const p of proj ?? []) if ((p as any).venue_id === id) projections.set(String((p as any).target_date).slice(0, 10), Number((p as any).projected_sales ?? 0));
      return buildProjectionRows(year, month, projections, actuals, history);
    });
    setRows(combineProjectionRows(perVenue));
    setHasManagerTarget((proj ?? []).length > 0);
    setLoading(false);
  }, [enabled, tenantId, key, year, month, monthStart, monthEnd]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  return { rows, hasManagerTarget, loading, reload: load };
}
