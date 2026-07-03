import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { ManagerTargetLine } from "@/types/revenueTargetsV2";

function fromDb(r: any): ManagerTargetLine {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    venueId: r.venue_id,
    targetDate: r.target_date,
    lineType: r.line_type,
    servicePeriodId: r.service_period_id ?? null,
    eventName: r.event_name ?? null,
    eventType: r.event_type ?? null,
    eventMode: r.event_mode ?? null,
    replacesServicePeriodId: r.replaces_service_period_id ?? null,
    venueArea: r.venue_area ?? null,
    eventStartTime: r.event_start_time ?? null,
    eventEndTime: r.event_end_time ?? null,
    targetInputMode: r.target_input_mode,
    managerGuestTarget: r.manager_guest_target == null ? null : Number(r.manager_guest_target),
    managerSpendPerGuestTarget: r.manager_spend_per_guest_target == null ? null : Number(r.manager_spend_per_guest_target),
    managerRevenueOverride: r.manager_revenue_override == null ? null : Number(r.manager_revenue_override),
    managerRevenueTarget: r.manager_revenue_target == null ? null : Number(r.manager_revenue_target),
    lineStatus: r.line_status,
    zeroReason: r.zero_reason ?? null,
    managerSource: r.manager_source ?? null,
    status: r.status,
    notes: r.notes ?? null,
  };
}

/**
 * Read Manager target lines. Callers filter operational vs roll-up using
 * `isOperationalLine` in revenueTargetAnalytics.ts (roll-up periods are
 * excluded from operational totals per the Phase 1 correction contract).
 */
export function useRevenueManagerTargetLines(year: number, month: number, venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<ManagerTargetLine[]>([]);
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
      .from("revenue_manager_target_lines")
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

  const ensureMonth = useCallback(async (venueIdsForSeed: string[]) => {
    if (!tenantId || !venueIdsForSeed.length) return { ok: false as const, error: "missing tenant or venues" };
    const { data, error } = await supabase.rpc("ensure_revenue_manager_target_lines_month", {
      p_tenant_id: tenantId,
      p_year: year,
      p_month: month,
      p_venue_ids: venueIdsForSeed,
    });
    if (error) return { ok: false as const, error: error.message };
    await fetchRows();
    return { ok: true as const, inserted: (data as any)?.inserted ?? 0 };
  }, [tenantId, year, month, fetchRows]);

  return { rows, loading, refetch: fetchRows, ensureMonth };
}
