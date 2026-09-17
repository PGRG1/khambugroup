import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { aggregateActualsByDate, monthDates } from "@/utils/dailyProjections";

/**
 * Independent data hook for the New Targets page.
 * Projections live in `revenue_daily_projections`; actuals come from `sales_records`.
 */
export function useDailyProjections(venueId: string | null, year: number, month: number) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { user } = useAuth();
  const [projections, setProjections] = useState<Map<string, number>>(new Map());
  const [actuals, setActuals] = useState<Map<string, number>>(new Map());
  /** All sales dates for this venue up to the end of the selected month. */
  const [history, setHistory] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dates = monthDates(year, month);
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];

  const load = useCallback(async () => {
    if (!tenantId || !venueId) {
      setProjections(new Map());
      setActuals(new Map());
      setHistory(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // All sales for this venue up to the end of the selected month, paged to
    // bypass the 1000-row cap. Needed so each day can look back 8 same-weekday
    // observations before it.
    const PAGE = 1000;
    const salesRows: any[] = [];
    let salesError: string | null = null;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: sErr } = await supabase
        .from("sales_records")
        .select("date, total_sales")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (sErr) { salesError = sErr.message; break; }
      if (!data || data.length === 0) break;
      salesRows.push(...data);
      if (data.length < PAGE) break;
    }

    const projRes = await supabase
      .from("revenue_daily_projections")
      .select("target_date, projected_sales")
      .eq("tenant_id", tenantId)
      .eq("venue_id", venueId)
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd);

    if (projRes.error || salesError) {
      setError(projRes.error?.message ?? salesError ?? "Failed to load");
      setLoading(false);
      return;
    }
    const p = new Map<string, number>();
    for (const r of projRes.data ?? []) {
      p.set(String((r as any).target_date).slice(0, 10), Number((r as any).projected_sales ?? 0));
    }
    setProjections(p);
    const hist = aggregateActualsByDate(salesRows);
    setHistory(hist);
    const monthOnly = new Map<string, number>();
    for (const [d, v] of hist) if (d >= monthStart && d <= monthEnd) monthOnly.set(d, v);
    setActuals(monthOnly);
    setLoading(false);
  }, [tenantId, venueId, monthStart, monthEnd]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  const saveProjection = useCallback(
    async (date: string, value: number | null): Promise<boolean> => {
      if (!tenantId || !venueId) return false;
      if (value === null) {
        const { error: delErr } = await supabase
          .from("revenue_daily_projections")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("venue_id", venueId)
          .eq("target_date", date);
        if (delErr) return false;
        setProjections((prev) => {
          const next = new Map(prev);
          next.delete(date);
          return next;
        });
        return true;
      }
      const { error: upErr } = await supabase
        .from("revenue_daily_projections")
        .upsert(
          {
            tenant_id: tenantId,
            venue_id: venueId,
            target_date: date,
            projected_sales: value,
            created_by: user?.id ?? null,
          },
          { onConflict: "tenant_id,venue_id,target_date" },
        );
      if (upErr) return false;
      setProjections((prev) => new Map(prev).set(date, value));
      return true;
    },
    [tenantId, venueId, user?.id],
  );

  return { projections, actuals, loading, error, reload: load, saveProjection };
}
