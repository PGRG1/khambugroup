import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface RevenueSource {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useRevenueSources() {
  const [sources, setSources] = useState<RevenueSource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("revenue_sources")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) {
      toast({ title: "Failed to load revenue sources", description: error.message, variant: "destructive" });
    } else {
      setSources((data ?? []) as RevenueSource[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (input: { name: string; description?: string }) => {
    const name = input.name.trim();
    if (!name) return false;
    const maxOrder = sources.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const { error } = await supabase.from("revenue_sources").insert({
      name,
      description: input.description ?? "",
      sort_order: maxOrder + 1,
    });
    if (error) {
      toast({ title: "Could not add revenue source", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<Pick<RevenueSource, "name" | "description" | "is_active" | "sort_order">>) => {
    const cleaned: Record<string, unknown> = { ...patch };
    if (typeof cleaned.name === "string") cleaned.name = (cleaned.name as string).trim();
    const { error } = await supabase.from("revenue_sources").update(cleaned).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("revenue_sources").delete().eq("id", id);
    if (error) {
      toast({ title: "Cannot delete source", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  return { sources, loading, reload: load, create, update, remove };
}
