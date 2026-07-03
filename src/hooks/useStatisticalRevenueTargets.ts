import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export const STATISTICAL_MODEL_VERSION = "same_weekday_median_12w_v1";

export interface StatisticalDailyRow {
  id: string;
  tenantId: string;
  venueId: string;
  venueName: string;
  targetDate: string; // YYYY-MM-DD
  amount: number;
  model: string;
  modelVersion: string;
  lookbackStart: string;
  lookbackEnd: string;
  observationCount: number;
  confidence: "high" | "low";
  generatedAt: string;
  generatedBy: string | null;
}

function fromDb(r: any): StatisticalDailyRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    venueId: r.venue_id,
    venueName: r.venue_name_snapshot,
    targetDate: r.target_date,
    amount: Number(r.statistical_target_amount ?? 0),
    model: r.model,
    modelVersion: r.model_version,
    lookbackStart: r.lookback_start,
    lookbackEnd: r.lookback_end,
    observationCount: Number(r.observation_count ?? 0),
    confidence: (r.confidence === "high" ? "high" : "low"),
    generatedAt: r.generated_at,
    generatedBy: r.generated_by ?? null,
  };
}

export interface GenerateArgs {
  year: number;
  month: number;
  venueIds: string[];
}

export interface GenerateOk {
  ok: true;
  monthly_total: number;
  venue_totals: Record<string, number>;
  inserted: number;
  model: string;
  model_version: string;
}

export interface InsufficientHistoryEntry {
  venue_id: string;
  venue_name: string;
  weekday: number;
}

export interface GenerateInsufficient {
  ok: false;
  reason: "insufficient_history";
  missing: InsufficientHistoryEntry[];
}

export interface GenerateError {
  ok: false;
  reason: "error";
  message: string;
}

export type GenerateResult = GenerateOk | GenerateInsufficient | GenerateError;

/**
 * Reads the read-only `revenue_statistical_targets_daily` table for the current
 * tenant/month and exposes a `generate` action that calls the SECURITY DEFINER
 * RPC — the only permitted write path. All statistical amounts are computed
 * server-side; this hook never sends amounts to the database.
 */
export function useStatisticalRevenueTargets(year: number, month: number) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<StatisticalDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  })();

  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("revenue_statistical_targets_daily")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd)
      .order("target_date", { ascending: true });
    if (!error && data) setRows(data.map(fromDb));
    setLoading(false);
  }, [tenantId, monthStart, monthEnd]);

  useEffect(() => {
    if (!tenantLoading) fetchRows();
  }, [fetchRows, tenantLoading]);

  const generate = useCallback(
    async ({ year: y, month: m, venueIds }: GenerateArgs): Promise<GenerateResult> => {
      if (!tenantId) return { ok: false, reason: "error", message: "No active tenant" };
      setGenerating(true);
      try {
        const { data, error } = await supabase.rpc("generate_statistical_targets_month", {
          p_tenant_id: tenantId,
          p_year: y,
          p_month: m,
          p_venue_ids: venueIds,
          p_model_version: STATISTICAL_MODEL_VERSION,
        });
        if (error) return { ok: false, reason: "error", message: error.message };
        const payload = data as any;
        if (payload?.ok === false && payload?.reason === "insufficient_history") {
          return {
            ok: false,
            reason: "insufficient_history",
            missing: Array.isArray(payload.missing) ? payload.missing : [],
          };
        }
        if (payload?.ok === true) {
          await fetchRows();
          return {
            ok: true,
            monthly_total: Number(payload.monthly_total ?? 0),
            venue_totals: (payload.venue_totals ?? {}) as Record<string, number>,
            inserted: Number(payload.inserted ?? 0),
            model: String(payload.model ?? ""),
            model_version: String(payload.model_version ?? STATISTICAL_MODEL_VERSION),
          };
        }
        return { ok: false, reason: "error", message: "Unexpected response from generator" };
      } finally {
        setGenerating(false);
      }
    },
    [tenantId, fetchRows],
  );

  return { rows, loading, generating, generate, refetch: fetchRows };
}
