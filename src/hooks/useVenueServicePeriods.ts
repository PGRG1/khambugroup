import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { VenueServicePeriod } from "@/types/revenueTargetsV2";

function fromDb(r: any): VenueServicePeriod {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    venueId: r.venue_id,
    name: r.name,
    code: r.code ?? null,
    startTime: r.start_time,
    endTime: r.end_time,
    crossesMidnight: !!r.crosses_midnight,
    applicableWeekdays: (r.applicable_weekdays ?? []).map((n: any) => Number(n)),
    isActive: !!r.is_active,
    sortOrder: Number(r.sort_order ?? 0),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to ?? null,
    isRollupOnly: !!r.is_rollup_only,
  };
}

/** Fetch venue service periods for the active tenant, optionally scoped to venues. */
export function useVenueServicePeriods(venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<VenueServicePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const scopeKey = (venueIds ?? []).join(",");

  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from("venue_service_periods")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("venue_id", { ascending: true })
      .order("sort_order", { ascending: true });
    if (venueIds && venueIds.length) q = q.in("venue_id", venueIds);
    const { data, error } = await q;
    if (!error && data) setRows(data.map(fromDb));
    setLoading(false);
  }, [tenantId, scopeKey]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  const operational = rows.filter((p) => p.isActive && !p.isRollupOnly);
  const rollupOnly = rows.filter((p) => p.isActive && p.isRollupOnly);

  return { rows, operational, rollupOnly, loading, refetch: fetchRows };
}
