import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface InventoryItem {
  id: string;
  name: string;
  category_id: string | null;
  category_name?: string;
  unit_of_measure: string;
  unit_size: string;
  par_level: number | null;
  is_active: boolean;
}

export interface InventoryPeriod {
  id: string;
  venue: string;
  period_label: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by: string;
}

export interface InventoryCount {
  id: string;
  period_id: string;
  item_id: string;
  item_name?: string;
  category_name?: string;
  venue: string;
  beginning_qty: number;
  purchases_qty: number;
  ending_qty: number;
  usage_qty: number;
  unit_cost: number;
  total_usage_cost: number;
}

export function useInventoryData() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [periods, setPeriods] = useState<InventoryPeriod[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [itemRes, periodRes, catRes] = await Promise.all([
      supabase.from("inventory_items").select("*").order("name"),
      supabase.from("inventory_periods").select("*").order("period_start", { ascending: false }),
      supabase.from("expense_categories").select("id, name").order("name"),
    ]);

    if (catRes.data) setCategories(catRes.data as any);
    if (itemRes.data) {
      const catMap = new Map((catRes.data || []).map((c: any) => [c.id, c.name]));
      setItems((itemRes.data as any[]).map((i) => ({ ...i, category_name: i.category_id ? catMap.get(i.category_id) : "" })));
    }
    if (periodRes.data) setPeriods(periodRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchCounts = useCallback(async (periodId: string): Promise<InventoryCount[]> => {
    const { data } = await supabase.from("inventory_counts").select("*").eq("period_id", periodId).order("created_at");
    if (!data) return [];
    const itemMap = new Map(items.map((i) => [i.id, { name: i.name, cat: i.category_name }]));
    return (data as any[]).map((c) => ({
      ...c,
      item_name: itemMap.get(c.item_id)?.name || "",
      category_name: itemMap.get(c.item_id)?.cat || "",
    }));
  }, [items]);

  const createItem = useCallback(async (item: Omit<InventoryItem, "id" | "category_name">) => {
    const { error } = await supabase.from("inventory_items").insert(item as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await fetchAll();
  }, [fetchAll, toast]);

  const createPeriod = useCallback(async (period: Omit<InventoryPeriod, "id">) => {
    const { data, error } = await supabase.from("inventory_periods").insert(period as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast]);

  const upsertCounts = useCallback(async (counts: Omit<InventoryCount, "id" | "usage_qty" | "total_usage_cost" | "item_name" | "category_name">[]) => {
    const { error } = await supabase.from("inventory_counts").upsert(counts as any, { onConflict: "period_id,item_id,venue" });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved", description: "Inventory counts updated." });
  }, [toast]);

  const closePeriod = useCallback(async (periodId: string) => {
    const { error } = await supabase.from("inventory_periods").update({ status: "closed" } as any).eq("id", periodId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await fetchAll();
  }, [fetchAll, toast]);

  return {
    items, periods, categories, loading,
    fetchAll, fetchCounts, createItem, createPeriod, upsertCounts, closePeriod,
  };
}
