import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { StatisticalDailyRowV2, Confidence } from "@/types/revenueTargetsV2";

export const STATISTICAL_MODEL_VERSION_V2 = "same_weekday_full_day_median_12w_v3";

function fromDb(r: any): StatisticalDailyRowV2 {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    venueId: r.venue_id,
    venueNameSnapshot: r.venue_name_snapshot,
    servicePeriodId: r.service_period_id ?? null,
    servicePeriodNameSnapshot: r.service_period_name_snapshot ?? null,
    targetDate: r.target_date,
    statisticalTargetAmount: Number(r.statistical_target_amount ?? 0),
    statisticalGuestTarget: r.statistical_guest_target == null ? null : Number(r.statistical_guest_target),
    statisticalSpendPerGuest: r.statistical_spend_per_guest == null ? null : Number(r.statistical_spend_per_guest),
    model: r.model,
    modelVersion: r.model_version,
    lookbackStart: r.lookback_start,
    lookbackEnd: r.lookback_end,
    observationCount: Number(r.observation_count ?? 0),
    revenueObservationCount: Number(r.revenue_observation_count ?? 0),
    guestObservationCount: Number(r.guest_observation_count ?? 0),
    confidence: (r.confidence ?? "unavailable") as Confidence,
    generatedAt: r.generated_at,
    generatedBy: r.generated_by ?? null,
  };
}

/**
 * Read the Full-Day roll-up Statistical benchmarks for a tenant/month.
 * The v2 RPC guarantees one row per (venue, business_date). Never merge with
 * service-period Manager rows.
 */
export function useRevenueStatisticalTargetsDaily(year: number, month: number, venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<StatisticalDailyRowV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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
      .from("revenue_statistical_targets_daily")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd)
      .order("target_date", { ascending: true });
    if (venueIds && venueIds.length) q = q.in("venue_id", venueIds);
    const { data, error } = await q;
    if (!error && data) setRows(data.map(fromDb));
    setLoading(false);
  }, [tenantId, monthStart, monthEnd, scopeKey]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  const generate = useCallback(async (venueIdsForGen: string[]) => {
    if (!tenantId || !venueIdsForGen.length) return { ok: false as const, error: "missing tenant or venues" };
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc("generate_revenue_statistical_targets_month_v2", {
        p_tenant_id: tenantId,
        p_year: year,
        p_month: month,
        p_venue_ids: venueIdsForGen,
        p_model_version: STATISTICAL_MODEL_VERSION_V2,
      });
      if (error) return { ok: false as const, error: error.message };
      await fetchRows();
      return { ok: true as const, result: data as any };
    } finally {
      setGenerating(false);
    }
  }, [tenantId, year, month, fetchRows]);

  return { rows, loading, generating, generate, refetch: fetchRows };
}
