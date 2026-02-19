import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [products, setProducts] = useState<StandardProduct[]>([]);
  const [conversions, setConversions] = useState<PackConversion[]>([]);
  const [mappings, setMappings] = useState<SupplierItemMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [prodRes, convRes, mapRes, supRes] = await Promise.all([
      supabase.from("standard_products").select("*").order("name"),
      supabase.from("product_pack_conversions").select("*"),
      supabase.from("supplier_item_mappings").select("*").order("supplier_item_name"),
      supabase.from("suppliers").select("id, name"),
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
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Standard Products CRUD
  const createProduct = useCallback(async (product: Omit<StandardProduct, "id" | "created_at" | "updated_at">) => {
    const { data, error } = await supabase.from("standard_products").insert(product as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Omit<StandardProduct, "id" | "created_at" | "updated_at">>) => {
    const { error } = await supabase.from("standard_products").update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("standard_products").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  // Pack Conversions CRUD
  const createConversion = useCallback(async (conv: Omit<PackConversion, "id" | "created_at">) => {
    const { error } = await supabase.from("product_pack_conversions").insert(conv as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  const deleteConversion = useCallback(async (id: string) => {
    const { error } = await supabase.from("product_pack_conversions").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  // Supplier Item Mappings CRUD
  const createMapping = useCallback(async (mapping: Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">) => {
    const { data, error } = await supabase.from("supplier_item_mappings").insert(mapping as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast]);

  const updateMapping = useCallback(async (id: string, updates: Partial<Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">>) => {
    const { error } = await supabase.from("supplier_item_mappings").update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  const deleteMapping = useCallback(async (id: string) => {
    const { error } = await supabase.from("supplier_item_mappings").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  // Invoice Payments
  const fetchPayments = useCallback(async (invoiceId: string): Promise<InvoicePayment[]> => {
    const { data } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoiceId).order("payment_date");
    return (data || []) as InvoicePayment[];
  }, []);

  const createPayment = useCallback(async (payment: Omit<InvoicePayment, "id" | "created_at">) => {
    const { error } = await supabase.from("invoice_payments").insert(payment as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    // Update invoice totals
    const payments = await fetchPayments(payment.invoice_id);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + payment.amount;
    // Get invoice total
    const { data: inv } = await supabase.from("invoices").select("total_amount").eq("id", payment.invoice_id).single();
    if (inv) {
      const remaining = Math.max(0, (inv as any).total_amount - totalPaid);
      const status = remaining <= 0 ? "paid" : "partially_paid";
      await supabase.from("invoices").update({ amount_paid: totalPaid, remaining_balance: remaining, payment_status: status } as any).eq("id", payment.invoice_id);
    }
    return true;
  }, [fetchPayments, toast]);

  // Purchase history for a standard product
  const fetchPurchaseHistory = useCallback(async (standardProductId: string) => {
    // Get all mappings for this product
    const { data: maps } = await supabase.from("supplier_item_mappings").select("id, supplier_id").eq("standard_product_id", standardProductId);
    if (!maps || maps.length === 0) return [];

    // Get line items linked to this standard product
    const { data: lineItems } = await supabase.from("invoice_line_items").select("*, invoice_id").eq("standard_product_id", standardProductId);
    if (!lineItems || lineItems.length === 0) return [];

    const invoiceIds = [...new Set((lineItems as any[]).map((li) => li.invoice_id))];
    const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, supplier_id").in("id", invoiceIds);
    const { data: suppliers } = await supabase.from("suppliers").select("id, name");

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
  }, []);

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
