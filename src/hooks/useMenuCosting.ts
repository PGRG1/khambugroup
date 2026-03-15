import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMenuItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_items" as any)
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMenuItems((data || []) as unknown as MenuItem[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchMenuItems(); }, [fetchMenuItems]);

  const createMenuItem = useCallback(async (item: { name: string; category: string; status?: string }) => {
    const { data, error } = await supabase.from("menu_items" as any).insert(item as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchMenuItems();
    return (data as any) as MenuItem;
  }, [fetchMenuItems, toast]);

  const updateMenuItem = useCallback(async (id: string, updates: Partial<Pick<MenuItem, "name" | "category" | "status" | "theoretical_cost">>) => {
    const { error } = await supabase.from("menu_items" as any).update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchMenuItems();
    return true;
  }, [fetchMenuItems, toast]);

  const deleteMenuItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("menu_items" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchMenuItems();
    return true;
  }, [fetchMenuItems, toast]);

  // Ingredients
  const fetchIngredients = useCallback(async (menuItemId: string) => {
    const { data, error } = await supabase
      .from("menu_item_ingredients" as any)
      .select("*")
      .eq("menu_item_id", menuItemId)
      .order("created_at");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return []; }
    return (data || []) as unknown as MenuItemIngredient[];
  }, [toast]);

  const saveIngredient = useCallback(async (ingredient: Omit<MenuItemIngredient, "id" | "created_at">, id?: string) => {
    const lineCost = ingredient.quantity_used * ingredient.reference_cost;
    const payload = { ...ingredient, line_cost: lineCost };
    if (id) {
      const { error } = await supabase.from("menu_item_ingredients" as any).update(payload as any).eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    } else {
      const { error } = await supabase.from("menu_item_ingredients" as any).insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [toast]);

  const deleteIngredient = useCallback(async (id: string) => {
    const { error } = await supabase.from("menu_item_ingredients" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    return true;
  }, [toast]);

  // Pricing
  const fetchPricing = useCallback(async (menuItemId: string) => {
    const { data, error } = await supabase
      .from("menu_item_pricing" as any)
      .select("*")
      .eq("menu_item_id", menuItemId)
      .order("created_at");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return []; }
    return (data || []) as unknown as MenuItemPricing[];
  }, [toast]);

  const savePricing = useCallback(async (pricing: { menu_item_id: string; price_type: string; selling_price: number }, theoreticalCost: number, id?: string) => {
    const grossProfit = pricing.selling_price - theoreticalCost;
    const foodCostPct = pricing.selling_price > 0 ? (theoreticalCost / pricing.selling_price) * 100 : 0;
    const payload = { ...pricing, gross_profit: grossProfit, food_cost_pct: foodCostPct };
    if (id) {
      const { error } = await supabase.from("menu_item_pricing" as any).update(payload as any).eq("id", id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    } else {
      const { error } = await supabase.from("menu_item_pricing" as any).insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [toast]);

  const deletePricing = useCallback(async (id: string) => {
    const { error } = await supabase.from("menu_item_pricing" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    return true;
  }, [toast]);

  // Recalculate theoretical cost from ingredients and update menu item + pricing
  const recalcTheoreticalCost = useCallback(async (menuItemId: string) => {
    const ingredients = await fetchIngredients(menuItemId);
    const total = ingredients.reduce((sum, ing) => sum + ing.line_cost, 0);
    await supabase.from("menu_items" as any).update({ theoretical_cost: total } as any).eq("id", menuItemId);

    // Also update all pricing rows
    const pricing = await fetchPricing(menuItemId);
    for (const p of pricing) {
      const grossProfit = p.selling_price - total;
      const foodCostPct = p.selling_price > 0 ? (total / p.selling_price) * 100 : 0;
      await supabase.from("menu_item_pricing" as any).update({ gross_profit: grossProfit, food_cost_pct: foodCostPct } as any).eq("id", p.id);
    }

    await fetchMenuItems();
  }, [fetchIngredients, fetchPricing, fetchMenuItems]);

  return {
    menuItems, loading, fetchMenuItems,
    createMenuItem, updateMenuItem, deleteMenuItem,
    fetchIngredients, saveIngredient, deleteIngredient,
    fetchPricing, savePricing, deletePricing,
    recalcTheoreticalCost,
  };
}
