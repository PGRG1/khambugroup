import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ServicePeriod {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useServicePeriods() {
  const [periods, setPeriods] = useState<ServicePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_periods")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) {
      toast({ title: "Failed to load service periods", description: error.message, variant: "destructive" });
    } else {
      setPeriods((data ?? []) as ServicePeriod[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const maxOrder = periods.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from("service_periods").insert({ name: trimmed, sort_order: maxOrder + 1 });
    if (error) {
      toast({ title: "Could not add service period", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<Pick<ServicePeriod, "name" | "is_active" | "sort_order">>) => {
    const cleaned: Record<string, unknown> = { ...patch };
    if (typeof cleaned.name === "string") cleaned.name = (cleaned.name as string).trim();
    const { error } = await supabase.from("service_periods").update(cleaned).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("service_periods").delete().eq("id", id);
    if (error) {
      toast({ title: "Cannot delete period", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  return { periods, loading, reload: load, create, update, remove };
}
