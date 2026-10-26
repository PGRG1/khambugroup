import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { SeatHistoryRow } from "@/utils/seatHistory";

export interface SeatHistoryEntry extends SeatHistoryRow { id: string; created_at: string }

const listeners = new Set<() => void>();
/** Tell every mounted seat-history reader to reload (after an edit). */
export function notifySeatHistoryChanged() { listeners.forEach((l) => l()); }

/** Seat history for the active tenant. The single source of truth for seats. */
export function useSeatHistory() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<SeatHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("venue_seat_history")
      .select("id, venue_id, seats, effective_from, created_at")
      .eq("tenant_id", tenantId)
      .order("effective_from", { ascending: false });
    setRows(((data ?? []) as any[]).map((r) => ({ ...r, effective_from: String(r.effective_from).slice(0, 10) })));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);
  useEffect(() => { listeners.add(load); return () => { listeners.delete(load); }; }, [load]);

  return { rows, loading, reload: load, tenantId };
}
