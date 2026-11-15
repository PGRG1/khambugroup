import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";

/**
 * The month's revenue target: one figure for the venues it covers (revenue_targets, one row per
 * tenant and month). It is never spread across days; projections live in revenue_daily_projections.
 *
 * The target applies to a view only when the venues in view are exactly the venues it covers
 * (no venues listed = all active venues). Otherwise `elsewhere` names who it is for, and it
 * cannot be changed from that view, so a single-venue view never overwrites a group target.
 */
export function useMonthTarget(year: number, month: number, scopeNames: string[], allNames: string[]) {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const [row, setRow] = useState<{ amount: number | null; venues: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId || !year || !month) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("revenue_targets").select("target_amount, venues")
        .eq("tenant_id", tenantId).eq("year", year).eq("month", month).maybeSingle();
      if (!live) return;
      setRow(data ? { amount: data.target_amount == null ? null : Number(data.target_amount), venues: data.venues ?? [] } : null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [tenantId, year, month, tick]);

  const scopeKey = [...scopeNames].sort().join("|");
  const covers = useMemo(() => (row ? (row.venues.length ? [...row.venues].sort() : [...allNames].sort()) : []), [row, allNames]);
  const set = !!row && row.amount != null;
  const applies = set && covers.join("|") === scopeKey;

  const save = useCallback(async (amount: number) => {
    if (!tenantId || !(amount > 0) || (set && !applies)) return { ok: false as const };
    const { error } = await supabase.from("revenue_targets").upsert(
      { tenant_id: tenantId, year, month, target_amount: Math.round(amount), venues: scopeKey ? scopeKey.split("|") : [], created_by: user?.id ?? null },
      { onConflict: "tenant_id,year,month" },
    );
    if (!error) setTick((t) => t + 1);
    return { ok: !error };
  }, [tenantId, year, month, scopeKey, set, applies, user?.id]);

  return {
    target: applies ? row!.amount : null,
    /** Set for a different group of venues than the ones in view. */
    elsewhere: set && !applies ? covers : null,
    loading,
    save,
  };
}
