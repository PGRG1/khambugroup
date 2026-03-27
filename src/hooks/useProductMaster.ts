import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProductSupplierEntry {
  id: string;
  product_master_id: string;
  supplier: string;
  external_sku: string;
  supplier_product_name: string;
  purchase_unit: string;
  purchase_unit_cost: number;
  status: string;
}

export interface ProductMasterItem {
  id: string;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  unit: string;
  unit_cost: number;
  supplier: string;
  status: string;
  purchase_unit: string;
  purchase_unit_cost: number;
  stock_uom: string;
  stock_qty: number;
  cost_per_stock_unit: number;
  base_unit_type: string;
  base_unit_qty: number;
  cost_per_base_unit: number;
  notes: string;
  created_at: string;
  updated_at: string;
  suppliers?: ProductSupplierEntry[];
}

export function useProductMaster() {
  const [products, setProducts] = useState<ProductMasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const [pmResult, psResult] = await Promise.all([
      supabase.from("product_master" as any).select("*").order("internal_sku"),
      supabase.from("product_suppliers" as any).select("*"),
    ]);
    if (pmResult.error) {
      toast({ title: "Error", description: pmResult.error.message, variant: "destructive" });
    } else {
      const suppliers = (psResult.data || []) as unknown as ProductSupplierEntry[];
      const supplierMap = new Map<string, ProductSupplierEntry[]>();
      for (const s of suppliers) {
        const arr = supplierMap.get(s.product_master_id) || [];
        arr.push(s);
        supplierMap.set(s.product_master_id, arr);
      }
      const items = ((pmResult.data || []) as unknown as ProductMasterItem[]).map(p => ({
        ...p,
        suppliers: supplierMap.get(p.id) || [],
      }));
      setProducts(items);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const createProduct = useCallback(async (product: Omit<ProductMasterItem, "id" | "created_at" | "updated_at" | "suppliers">) => {
    const { supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost, ...pmData } = product;
    const { data, error } = await supabase.from("product_master" as any).insert(pmData as any).select("id").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    // Insert supplier entry if supplier is provided
    if (supplier && (data as any)?.id) {
      await supabase.from("product_suppliers" as any).insert({
        product_master_id: (data as any).id,
        supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost,
      } as any);
    }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Omit<ProductMasterItem, "id" | "created_at" | "updated_at" | "suppliers">>) => {
    // Don't strip supplier-level fields — they exist on product_master too
    const { error } = await supabase.from("product_master" as any).update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("product_master" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  // Supplier-level CRUD
  const addSupplier = useCallback(async (entry: Omit<ProductSupplierEntry, "id">) => {
    const { error } = await supabase.from("product_suppliers" as any).insert(entry as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  const updateSupplier = useCallback(async (id: string, updates: Partial<Omit<ProductSupplierEntry, "id">>) => {
    const { error } = await supabase.from("product_suppliers" as any).update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await supabase.from("product_suppliers" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  return { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier };
}
