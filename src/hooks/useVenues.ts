import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Venue {
  id: string;
  name: string;
  seats: number | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) {
        const msg = (error as any)?.message ?? "";
        // Silently ignore aborts (component unmount, navigation, StrictMode re-mount)
        if (!/abort/i.test(msg)) {
          toast({ title: "Failed to load venues", description: msg, variant: "destructive" });
        }
      } else {
        setVenues((data ?? []) as Venue[]);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (e?.name !== "AbortError" && !/abort/i.test(msg)) {
        toast({ title: "Failed to load venues", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (input: { name: string; seats?: number | null; notes?: string }) => {
    const name = input.name.trim();
    if (!name) return false;
    const maxOrder = venues.reduce((m, v) => Math.max(m, v.sort_order), 0);
    const { error } = await supabase.from("venues").insert({
      name,
      seats: input.seats ?? null,
      notes: input.notes ?? "",
      sort_order: maxOrder + 1,
    });
    if (error) {
      toast({ title: "Could not add venue", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const update = async (id: string, patch: Partial<Pick<Venue, "name" | "seats" | "is_active" | "notes" | "sort_order">>) => {
    const cleaned: Record<string, unknown> = { ...patch };
    if (typeof cleaned.name === "string") cleaned.name = (cleaned.name as string).trim();
    const { error } = await supabase.from("venues").update(cleaned).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("venues").delete().eq("id", id);
    if (error) {
      toast({ title: "Cannot delete venue", description: error.message, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  };

  return { venues, loading, reload: load, create, update, remove };
}
