import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface ServicePeriod {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  revenue_source_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useServicePeriods() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [periods, setPeriods] = useState<ServicePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setPeriods([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("service_periods")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name");
    if (error) {
      toast({ title: "Failed to load service periods", description: error.message, variant: "destructive" });
    } else {
      setPeriods((data ?? []) as ServicePeriod[]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  const create = async (input: { name: string; revenue_source_id: string }) => {
    if (!tenantId) return false;
    const trimmed = input.name.trim();
    if (!trimmed) return false;
    if (!input.revenue_source_id) {
      toast({ title: "Pick a Revenue Source", description: "A service period must belong to a Revenue Source.", variant: "destructive" });
      return false;
    }
    const maxOrder = periods.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from("service_periods").insert({
      name: trimmed,
      sort_order: maxOrder + 1,
      revenue_source_id: input.revenue_source_id,
      tenant_id: tenantId,
    });
    if (error) {
      toast({ title: "Could not add service period", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<Pick<ServicePeriod, "name" | "is_active" | "sort_order" | "revenue_source_id">>) => {
    if (!tenantId) return false;
    const cleaned: Record<string, unknown> = { ...patch };
    if (typeof cleaned.name === "string") cleaned.name = (cleaned.name as string).trim();
    const { error } = await supabase.from("service_periods").update(cleaned).eq("id", id).eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("service_periods").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Cannot delete period", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  return { periods, loading, reload: load, create, update, remove };
}
