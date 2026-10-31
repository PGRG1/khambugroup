import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { latestConfirmedCosts, recipeUnitCost, type CostProduct, type FoodReceipt, type FoodLine } from "@/utils/menuCosts";
import { tenantToday } from "@/utils/salesRecordChecks";

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
    try { const data = await fetchAllRows("menu_items", "*", {col:"name",asc:true}, tenantId); setMenuItems(data as unknown as MenuItem[]); }
    catch (error) { toast({ title: "Error", description: error instanceof Error ? error.message : "Could not load recipes", variant: "destructive" }); }
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
    if (!tenantId) return false;
    const ingredients = await fetchIngredients(menuItemId);
    const total = ingredients.reduce((sum, ing) => sum + ing.line_cost, 0);
    const {error:costError} = await supabase.from("menu_items" as any).update({ theoretical_cost: total } as any).eq("id", menuItemId).eq("tenant_id", tenantId);
    if(costError) { toast({title:"Could not update recipe cost",description:costError.message,variant:"destructive"}); return false; }

    const pricing = await fetchPricing(menuItemId);
    for (const p of pricing) {
      const grossProfit = p.selling_price - total;
      const foodCostPct = p.selling_price > 0 ? (total / p.selling_price) * 100 : 0;
      const {error} = await supabase.from("menu_item_pricing" as any).update({ gross_profit: grossProfit, food_cost_pct: foodCostPct } as any).eq("id", p.id).eq("tenant_id", tenantId);
      if(error) { toast({title:"Could not update price cost",description:error.message,variant:"destructive"});return false; }
    }

    await fetchMenuItems();
    return true;
  }, [fetchIngredients, fetchPricing, fetchMenuItems, tenantId, toast]);

  const refreshPurchaseCosts = useCallback(async () => {
    if (!tenantId) return;
    const [products, receipts, received, ingredients] = await Promise.all([
      fetchAllRows('product_master','*',undefined,tenantId), fetchAllRows('goods_received_notes','id,venue,status,received_date',undefined,tenantId),
      fetchAllRows('grn_items','id,grn_id,product_master_id,accepted_qty,quantity_received,unit_cost,unit,created_at',undefined,tenantId), fetchAllRows('menu_item_ingredients','*',undefined,tenantId),
    ]);
    const latest = latestConfirmedCosts(receipts as FoodReceipt[],received as FoodLine[],tenantToday());
    const masters = new Map((products as unknown as CostProduct[]).map(p=>[p.id,p]));
    const changed = new Set<string>();
    for (const ingredient of ingredients as unknown as MenuItemIngredient[]) {
      const product = ingredient.product_master_id ? masters.get(ingredient.product_master_id) : undefined;
      if (!product) continue;
      const cost = recipeUnitCost(product,latest.get(product.id),ingredient.unit_used);
      if(cost == null) continue;
      const lineCost = Number(ingredient.quantity_used) * cost;
      if(Math.abs(Number(ingredient.reference_cost)-cost)<.0000001 && Math.abs(Number(ingredient.line_cost)-lineCost)<.0000001) continue;
      const {error} = await supabase.from('menu_item_ingredients').update({reference_cost:cost,line_cost:lineCost}).eq('id',ingredient.id).eq('tenant_id',tenantId);
      if(error) throw error;
      changed.add(ingredient.menu_item_id);
    }
    for (const id of changed) { if(!await recalcTheoreticalCost(id)) throw new Error('Some recipe costs could not be updated.'); }
  },[tenantId,recalcTheoreticalCost]);

  return {
    menuItems, loading, fetchMenuItems,
    createMenuItem, updateMenuItem, deleteMenuItem,
    fetchIngredients, saveIngredient, deleteIngredient,
    fetchPricing, savePricing, deletePricing,
    recalcTheoreticalCost, refreshPurchaseCosts,
  };
}
