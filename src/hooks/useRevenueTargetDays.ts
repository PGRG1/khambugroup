import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { RevenueTargetDay, OperatingStatus } from "@/types/revenueTargetsV2";

function fromDb(r: any): RevenueTargetDay {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    venueId: r.venue_id,
    targetDate: r.target_date,
    operatingStatus: (r.operating_status ?? "normal") as OperatingStatus,
    notes: r.notes ?? null,
  };
}

export function useRevenueTargetDays(year: number, month: number, venueIds?: string[]) {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<RevenueTargetDay[]>([]);
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
      .from("revenue_target_days")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("target_date", monthStart)
      .lte("target_date", monthEnd);
    if (venueIds && venueIds.length) q = q.in("venue_id", venueIds);
    const { data, error } = await q;
    if (!error && data) setRows(data.map(fromDb));
    setLoading(false);
  }, [tenantId, monthStart, monthEnd, scopeKey]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  return { rows, loading, refetch: fetchRows };
}
