import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RevenueSource } from "@/types/revenueSource";

const fromDb = (r: any): RevenueSource => ({
  id: r.id,
  name: r.name,
  isActive: r.is_active,
  isDefault: r.is_default,
  sortOrder: r.sort_order,
});

export function useRevenueSources() {
  const [sources, setSources] = useState<RevenueSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("revenue_sources")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) setSources(data.map(fromDb));
    setLoading(false);
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const addSource = useCallback(async (name: string) => {
    const next = (sources[sources.length - 1]?.sortOrder ?? 0) + 1;
    const { error } = await (supabase as any).from("revenue_sources")
      .insert({ name, sort_order: next });
    if (!error) await fetchSources();
    return !error;
  }, [sources, fetchSources]);

  const updateSource = useCallback(async (id: string, updates: Partial<RevenueSource>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    const { error } = await (supabase as any).from("revenue_sources").update(dbUpdates).eq("id", id);
    if (!error) await fetchSources();
    return !error;
  }, [fetchSources]);

  const deleteSource = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("revenue_sources").delete().eq("id", id);
    if (!error) await fetchSources();
    return !error;
  }, [fetchSources]);

  const defaultSource = sources.find((s) => s.isDefault) ?? sources[0] ?? null;

  return { sources, activeSources: sources.filter((s) => s.isActive), defaultSource, loading, addSource, updateSource, deleteSource, refetch: fetchSources };
}
