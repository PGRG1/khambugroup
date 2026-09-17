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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dates = monthDates(year, month);
  const monthStart = dates[0];
  const monthEnd = dates[dates.length - 1];

  const load = useCallback(async () => {
    if (!tenantId || !venueId) {
      setProjections(new Map());
      setActuals(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [projRes, salesRes] = await Promise.all([
      supabase
        .from("revenue_daily_projections")
        .select("target_date, projected_sales")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .gte("target_date", monthStart)
        .lte("target_date", monthEnd),
      supabase
        .from("sales_records")
        .select("date, total_sales")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .gte("date", monthStart)
        .lte("date", monthEnd),
    ]);

    if (projRes.error || salesRes.error) {
      setError(projRes.error?.message ?? salesRes.error?.message ?? "Failed to load");
      setLoading(false);
      return;
    }
    const p = new Map<string, number>();
    for (const r of projRes.data ?? []) {
      p.set(String((r as any).target_date).slice(0, 10), Number((r as any).projected_sales ?? 0));
    }
    setProjections(p);
    setActuals(aggregateActualsByDate((salesRes.data ?? []) as any[]));
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
