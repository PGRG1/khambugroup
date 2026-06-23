import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface ProductSupplierEntry {
  id: string;
  product_master_id: string;
  supplier: string;
  external_sku: string;
  supplier_product_name: string;
  purchase_unit: string;
  purchase_unit_cost: number;
  status: string;
  stock_uom: string;
  stock_qty: number;
  base_unit_type: string;
  base_unit_qty: number;
}

export type FinancialTreatment =
  | ""
  | "COGS"
  | "OpEx"
  | "Asset - Supplier Deposit"
  | "Asset - Fixed Asset"
  | "Asset - Prepayment"
  | "Asset - Other";

export const FINANCIAL_TREATMENTS: { value: FinancialTreatment; label: string; group: "P&L" | "Asset" }[] = [
  { value: "COGS", label: "COGS", group: "P&L" },
  { value: "OpEx", label: "OpEx", group: "P&L" },
  { value: "Asset - Supplier Deposit", label: "Asset – Supplier & Vendor Deposit", group: "Asset" },
  { value: "Asset - Fixed Asset", label: "Asset – Fixed Asset", group: "Asset" },
  { value: "Asset - Prepayment", label: "Asset – Prepayment", group: "Asset" },
  { value: "Asset - Other", label: "Asset – Other", group: "Asset" },
];

export function plSectionFor(t: string): string {
  if (t === "COGS") return "COGS";
  if (t === "OpEx") return "Operating Expenses";
  if (t.startsWith("Asset")) return "Not P&L / Balance Sheet Asset";
  return "—";
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
  financial_treatment: FinancialTreatment | string;
  default_coa_account_id: string | null;
  accounting_category?: string;
  creates_stock_movement: boolean;
  created_at: string;
  updated_at: string;
  suppliers?: ProductSupplierEntry[];
}

export function useProductMaster() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [products, setProducts] = useState<ProductMasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProducts = useCallback(async () => {
    if (!tenantId) { setProducts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [pmData, psData] = await Promise.all([
        fetchAllRows("product_master", "*", { col: "internal_sku", asc: true }, tenantId),
        fetchAllRows("product_suppliers", "*", undefined, tenantId),
      ]);
      const suppliers = psData as unknown as ProductSupplierEntry[];
      const supplierMap = new Map<string, ProductSupplierEntry[]>();
      for (const s of suppliers) {
        const arr = supplierMap.get(s.product_master_id) || [];
        arr.push(s);
        supplierMap.set(s.product_master_id, arr);
      }
      const items = (pmData as unknown as ProductMasterItem[]).map(p => ({
        ...p,
        suppliers: supplierMap.get(p.id) || [],
      }));
      setProducts(items);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to load products", variant: "destructive" });
    }
    setLoading(false);
  }, [toast, tenantId]);

  useEffect(() => { if (!tenantLoading) fetchProducts(); }, [fetchProducts, tenantLoading]);

  const createProduct = useCallback(async (product: Omit<ProductMasterItem, "id" | "created_at" | "updated_at" | "suppliers">) => {
    if (!tenantId) return false;
    const { supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost, stock_uom, stock_qty, base_unit_type, base_unit_qty, ...pmData } = product;

    // Check if a product with the same internal_sku already exists in THIS tenant
    const { data: existing } = await supabase
      .from("product_master" as any)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("internal_sku", product.internal_sku)
      .limit(1);

    let productId: string;

    if (existing && (existing as any[]).length > 0) {
      productId = (existing as any[])[0].id;
      const sharedUpdates: Record<string, any> = {};
      if (pmData.internal_product_name) sharedUpdates.internal_product_name = pmData.internal_product_name;
      if (pmData.level1_category) sharedUpdates.level1_category = pmData.level1_category;
      if (pmData.level2_category !== undefined) sharedUpdates.level2_category = pmData.level2_category;
      if (pmData.level3_category !== undefined) sharedUpdates.level3_category = pmData.level3_category;
      if (pmData.unit) sharedUpdates.unit = pmData.unit;
      if (pmData.unit_cost !== undefined) sharedUpdates.unit_cost = pmData.unit_cost;
      if (pmData.status) sharedUpdates.status = pmData.status;
      if (pmData.notes !== undefined) sharedUpdates.notes = pmData.notes;
      if (pmData.cost_per_stock_unit !== undefined) sharedUpdates.cost_per_stock_unit = pmData.cost_per_stock_unit;
      if (pmData.cost_per_base_unit !== undefined) sharedUpdates.cost_per_base_unit = pmData.cost_per_base_unit;
      if (Object.keys(sharedUpdates).length > 0) {
        await supabase.from("product_master" as any).update(sharedUpdates as any).eq("id", productId).eq("tenant_id", tenantId);
      }
    } else {
      const { data, error } = await supabase.from("product_master" as any).insert({ ...pmData, tenant_id: tenantId } as any).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
      productId = (data as any).id;
    }

    if (supplier && productId) {
      await supabase.from("product_suppliers" as any).insert({
        product_master_id: productId,
        supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost,
        stock_uom, stock_qty, base_unit_type, base_unit_qty,
        tenant_id: tenantId,
      } as any);
    }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Omit<ProductMasterItem, "id" | "created_at" | "updated_at" | "suppliers">>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_master" as any).update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_master" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const addSupplier = useCallback(async (entry: Omit<ProductSupplierEntry, "id">) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_suppliers" as any).insert({ ...entry, tenant_id: tenantId } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const updateSupplier = useCallback(async (id: string, updates: Partial<Omit<ProductSupplierEntry, "id">>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_suppliers" as any).update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const deleteSupplier = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_suppliers" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const splitProduct = useCallback(async (
    oldProductId: string,
    supplierEntryId: string,
    updates: Partial<Omit<ProductMasterItem, "id" | "created_at" | "updated_at" | "suppliers">>
  ) => {
    if (!tenantId) return false;
    const { data: existing } = await supabase.from("product_master" as any).select("*").eq("id", oldProductId).eq("tenant_id", tenantId).single();
    if (!existing) { toast({ title: "Error", description: "Product not found", variant: "destructive" }); return false; }

    const { id, created_at, updated_at, ...base } = existing as any;
    const newRow = { ...base, ...updates, tenant_id: tenantId };

    const { data: inserted, error: insertErr } = await supabase.from("product_master" as any).insert(newRow as any).select("id").single();
    if (insertErr) { toast({ title: "Error", description: insertErr.message, variant: "destructive" }); return false; }

    const { error: updateErr } = await supabase.from("product_suppliers" as any)
      .update({ product_master_id: (inserted as any).id } as any)
      .eq("id", supplierEntryId)
      .eq("tenant_id", tenantId);
    if (updateErr) { toast({ title: "Error", description: updateErr.message, variant: "destructive" }); return false; }

    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const reassignSupplier = useCallback(async (supplierEntryId: string, newProductMasterId: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_suppliers" as any)
      .update({ product_master_id: newProductMasterId } as any)
      .eq("id", supplierEntryId)
      .eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchProducts();
    return true;
  }, [fetchProducts, toast, tenantId]);

  const deleteProductIfOrphaned = useCallback(async (productId: string) => {
    if (!tenantId) return;
    const { data } = await supabase.from("product_suppliers" as any).select("id").eq("product_master_id", productId).eq("tenant_id", tenantId).limit(1);
    if (data && (data as any[]).length === 0) {
      await supabase.from("product_master" as any).delete().eq("id", productId).eq("tenant_id", tenantId);
    }
    await fetchProducts();
  }, [fetchProducts, tenantId]);

  return { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier, splitProduct, reassignSupplier, deleteProductIfOrphaned };
}
