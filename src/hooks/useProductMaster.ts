import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  created_at: string;
  updated_at: string;
}

export function useProductMaster() {
  const [products, setProducts] = useState<ProductMasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_master" as any)
      .select("*")
      .order("internal_sku");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProducts((data || []) as unknown as ProductMasterItem[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const createProduct = useCallback(async (product: Omit<ProductMasterItem, "id" | "created_at" | "updated_at">) => {
    const { error } = await supabase.from("product_master" as any).insert(product as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Omit<ProductMasterItem, "id" | "created_at" | "updated_at">>) => {
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

  return { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct };
}
