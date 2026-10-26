import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { makeClosedLookup, type VenueClosure, type VenueClosureRule } from "@/utils/venueClosures";

/** Closures and closure rules for the given venues (all dates; the tables stay small). */
export function useVenueClosures(venueIds: string[]) {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const ids = [...venueIds].sort().join(",");
  const key = ["venue-closures", tenantId, ids];
  const q = useQuery({
    queryKey: key,
    enabled: !!tenantId && venueIds.length > 0,
    queryFn: async () => {
      const [c, r] = await Promise.all([
        supabase.from("venue_closures").select("*").in("venue_id", venueIds),
        supabase.from("venue_closure_rules").select("*").in("venue_id", venueIds),
      ]);
      return { closures: (c.data ?? []) as VenueClosure[], rules: (r.data ?? []) as VenueClosureRule[] };
    },
  });
  const closures = q.data?.closures ?? [];
  const rules = q.data?.rules ?? [];
  const lookup = useMemo(() => makeClosedLookup(closures, rules), [closures, rules]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["venue-closures"] });

  const markClosed = async (venueId: string, date: string, reason: string | null, note: string | null) => {
    if (!tenantId || !user) return false;
    const { error } = await supabase.from("venue_closures").upsert(
      { tenant_id: tenantId, venue_id: venueId, date, reason, note, source: "manual", created_by: user.id },
      { onConflict: "venue_id,date" });
    await refresh();
    return !error;
  };
  const unmark = async (venueId: string, date: string) => {
    const { error } = await supabase.from("venue_closures").delete().eq("venue_id", venueId).eq("date", date);
    await (supabase as any).from("venue_closed_days").delete().eq("venue_id", venueId).eq("date", date);
    await refresh();
    return !error;
  };
  const addRule = async (rule: { venue_id: string; weekday: number | null; start_date: string; end_date: string | null; reason: string | null }) => {
    if (!tenantId || !user) return false;
    const { error } = await supabase.from("venue_closure_rules").insert({ ...rule, tenant_id: tenantId, created_by: user.id });
    await refresh();
    return !error;
  };
  const removeRule = async (id: string) => {
    const { error } = await supabase.from("venue_closure_rules").delete().eq("id", id);
    await refresh();
    return !error;
  };
  return { closures, rules, lookup, loading: q.isLoading, markClosed, unmark, addRule, removeRule };
}
