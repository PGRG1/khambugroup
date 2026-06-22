import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface StandardProduct {
  id: string;
  name: string;
  category: string;
  sub_category: string | null;
  base_unit: string;
  reorder_level: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PackConversion {
  id: string;
  standard_product_id: string;
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
  created_at: string;
}

export interface SupplierItemMapping {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  supplier_item_name: string;
  supplier_sku: string | null;
  standard_product_id: string;
  standard_product_name?: string;
  purchase_unit: string;
  quantity_per_unit: number;
  default_unit_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export function useStandardProducts() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [products, setProducts] = useState<StandardProduct[]>([]);
  const [conversions, setConversions] = useState<PackConversion[]>([]);
  const [mappings, setMappings] = useState<SupplierItemMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setProducts([]); setConversions([]); setMappings([]); setLoading(false); return; }
    const [prodRes, convRes, mapRes, supRes] = await Promise.all([
      supabase.from("standard_products").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("product_pack_conversions").select("*").eq("tenant_id", tenantId),
      supabase.from("supplier_item_mappings").select("*").eq("tenant_id", tenantId).order("supplier_item_name"),
      supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId),
    ]);

    if (prodRes.data) setProducts(prodRes.data as StandardProduct[]);
    if (convRes.data) setConversions(convRes.data as PackConversion[]);

    if (mapRes.data && supRes.data) {
      const supMap = new Map((supRes.data as any[]).map((s) => [s.id, s.name]));
      const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p.name]));
      setMappings(
        (mapRes.data as any[]).map((m) => ({
          ...m,
          supplier_name: supMap.get(m.supplier_id) || "Unknown",
          standard_product_name: prodMap.get(m.standard_product_id) || "Unknown",
        }))
      );
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchAll(); }, [fetchAll, tenantLoading]);

  const createProduct = useCallback(async (product: Omit<StandardProduct, "id" | "created_at" | "updated_at">) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("standard_products").insert({ ...product, tenant_id: tenantId } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast, tenantId]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Omit<StandardProduct, "id" | "created_at" | "updated_at">>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("standard_products").update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("standard_products").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const createConversion = useCallback(async (conv: Omit<PackConversion, "id" | "created_at">) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_pack_conversions").insert({ ...conv, tenant_id: tenantId } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const deleteConversion = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("product_pack_conversions").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const createMapping = useCallback(async (mapping: Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("supplier_item_mappings").insert({ ...mapping, tenant_id: tenantId } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast, tenantId]);

  const updateMapping = useCallback(async (id: string, updates: Partial<Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">>) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("supplier_item_mappings").update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const deleteMapping = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("supplier_item_mappings").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const fetchPayments = useCallback(async (invoiceId: string): Promise<InvoicePayment[]> => {
    if (!tenantId) return [];
    const { data } = await supabase.from("invoice_payments").select("*").eq("tenant_id", tenantId).eq("invoice_id", invoiceId).order("payment_date");
    return (data || []) as InvoicePayment[];
  }, [tenantId]);

  const createPayment = useCallback(async (payment: Omit<InvoicePayment, "id" | "created_at">) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("invoice_payments").insert({ ...payment, tenant_id: tenantId } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    const payments = await fetchPayments(payment.invoice_id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + payment.amount;
    const { data: inv } = await supabase.from("invoices").select("total_amount").eq("id", payment.invoice_id).eq("tenant_id", tenantId).single();
    if (inv) {
      const remaining = Math.max(0, (inv as any).total_amount - totalPaid);
      const status = remaining <= 0 ? "paid" : "partially_paid";
      await supabase.from("invoices").update({ amount_paid: totalPaid, remaining_balance: remaining, payment_status: status } as any).eq("id", payment.invoice_id).eq("tenant_id", tenantId);
    }
    return true;
  }, [fetchPayments, toast, tenantId]);

  const fetchPurchaseHistory = useCallback(async (standardProductId: string) => {
    if (!tenantId) return [];
    const { data: maps } = await supabase.from("supplier_item_mappings").select("id, supplier_id").eq("tenant_id", tenantId).eq("standard_product_id", standardProductId);
    if (!maps || maps.length === 0) return [];

    const liAll = await fetchAllRows("invoice_line_items", "*, invoice_id", undefined, tenantId);
    const lineItems = (liAll as any[]).filter((li) => li.standard_product_id === standardProductId);
    if (!lineItems || lineItems.length === 0) return [];

    const invoiceIds = [...new Set((lineItems as any[]).map((li) => li.invoice_id))];
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, supplier_id").eq("tenant_id", tenantId).in("id", invoiceIds);
    const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId);

    const invMap = new Map((invoices || []).map((i: any) => [i.id, i]));
    const supMap = new Map((suppliers || []).map((s: any) => [s.id, s.name]));

    return (lineItems as any[]).map((li) => {
      const inv = invMap.get(li.invoice_id);
      return {
        date: inv?.invoice_date || "",
        supplier: supMap.get(inv?.supplier_id) || "Unknown",
        invoice_number: inv?.invoice_number || "",
        quantity: li.quantity,
        unit: li.unit || "",
        unit_price: li.unit_price,
        total: li.total,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [tenantId]);

  return {
    products, conversions, mappings, loading,
    fetchAll,
    createProduct, updateProduct, deleteProduct,
    createConversion, deleteConversion,
    createMapping, updateMapping, deleteMapping,
    fetchPayments, createPayment,
    fetchPurchaseHistory,
  };
}
