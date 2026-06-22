import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  theoretical_cost: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  product_master_id: string | null;
  sku: string;
  description: string;
  quantity_used: number;
  unit_used: string;
  reference_cost: number;
  line_cost: number;
  created_at: string;
}

export interface MenuItemPricing {
  id: string;
  menu_item_id: string;
  price_type: string;
  selling_price: number;
  gross_profit: number;
  food_cost_pct: number;
  created_at: string;
}

export function useMenuCosting() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMenuItems = useCallback(async () => {
    if (!tenantId) { setMenuItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_items" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMenuItems((data || []) as unknown as MenuItem[]);
    }
    setLoading(false);
  }, [toast, tenantId]);

  useEffect(() => { if (!tenantLoading) fetchMenuItems(); }, [fetchMenuItems, tenantLoading]);

  const createMenuItem = useCallback(async (item: { name: string; category: string; status?: string }) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("menu_items" as any).insert({ ...item, tenant_id: tenantId } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchMenuItems();
    return (data as any) as MenuItem;
  }, [fetchMenuItems, toast, tenantId]);

  const updateMenuItem = useCallback(async (id: string, updates: Partial<Pick<MenuItem, "name" | "category" | "status" | "theoretical_cost">>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("menu_items" as any).update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchMenuItems();
    return true;
  }, [fetchMenuItems, toast, tenantId]);

  const deleteMenuItem = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("menu_items" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchMenuItems();
    return true;
  }, [fetchMenuItems, toast, tenantId]);

  const fetchIngredients = useCallback(async (menuItemId: string) => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("menu_item_ingredients" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("menu_item_id", menuItemId)
      .order("created_at");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return []; }
    return (data || []) as unknown as MenuItemIngredient[];
  }, [toast, tenantId]);

  const saveIngredient = useCallback(async (ingredient: Omit<MenuItemIngredient, "id" | "created_at">, id?: string) => {
    if (!tenantId) return false;
    const lineCost = ingredient.quantity_used * ingredient.reference_cost;
    const payload = { ...ingredient, line_cost: lineCost };
    if (id) {
      const { error } = await supabase.from("menu_item_ingredients" as any).update(payload as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    } else {
      const { error } = await supabase.from("menu_item_ingredients" as any).insert({ ...payload, tenant_id: tenantId } as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [toast, tenantId]);

  const deleteIngredient = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("menu_item_ingredients" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    return true;
  }, [toast, tenantId]);

  const fetchPricing = useCallback(async (menuItemId: string) => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("menu_item_pricing" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("menu_item_id", menuItemId)
      .order("created_at");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return []; }
    return (data || []) as unknown as MenuItemPricing[];
  }, [toast, tenantId]);

  const savePricing = useCallback(async (pricing: { menu_item_id: string; price_type: string; selling_price: number }, theoreticalCost: number, id?: string) => {
    if (!tenantId) return false;
    const grossProfit = pricing.selling_price - theoreticalCost;
    const foodCostPct = pricing.selling_price > 0 ? (theoreticalCost / pricing.selling_price) * 100 : 0;
    const payload = { ...pricing, gross_profit: grossProfit, food_cost_pct: foodCostPct };
    if (id) {
      const { error } = await supabase.from("menu_item_pricing" as any).update(payload as any).eq("id", id).eq("tenant_id", tenantId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    } else {
      const { error } = await supabase.from("menu_item_pricing" as any).insert({ ...payload, tenant_id: tenantId } as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [toast, tenantId]);

  const deletePricing = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("menu_item_pricing" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    return true;
  }, [toast, tenantId]);

  const recalcTheoreticalCost = useCallback(async (menuItemId: string) => {
    if (!tenantId) return;
    const ingredients = await fetchIngredients(menuItemId);
    const total = ingredients.reduce((sum, ing) => sum + ing.line_cost, 0);
    await supabase.from("menu_items" as any).update({ theoretical_cost: total } as any).eq("id", menuItemId).eq("tenant_id", tenantId);

    const pricing = await fetchPricing(menuItemId);
    for (const p of pricing) {
      const grossProfit = p.selling_price - total;
      const foodCostPct = p.selling_price > 0 ? (total / p.selling_price) * 100 : 0;
      await supabase.from("menu_item_pricing" as any).update({ gross_profit: grossProfit, food_cost_pct: foodCostPct } as any).eq("id", p.id).eq("tenant_id", tenantId);
    }

    await fetchMenuItems();
  }, [fetchIngredients, fetchPricing, fetchMenuItems, tenantId]);

  return {
    menuItems, loading, fetchMenuItems,
    createMenuItem, updateMenuItem, deleteMenuItem,
    fetchIngredients, saveIngredient, deleteIngredient,
    fetchPricing, savePricing, deletePricing,
    recalcTheoreticalCost,
  };
}
