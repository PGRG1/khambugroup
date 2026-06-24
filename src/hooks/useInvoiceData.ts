import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payment_terms: string | null;
  invoice_rounding_mode?: string | null;
  is_active: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  item_code: string;
  description: string;
  pack_size: string;
  category_id: string | null;
  category_name?: string;
  quantity: number;
  unit: string | null;
  weight: number | null;
  unit_price: number;
  discount: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  product_master_id: string | null;
  accepted_qty?: number | null;
  qty_difference?: number | null;
  receiving_reason?: string | null;
  receiving_note?: string | null;
  accepted_price?: number | null;
  price_disputed?: boolean | null;
  is_free_unit_line?: boolean | null;
  deal_id?: string | null;
}

export interface Invoice {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  venue: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount: number;
  discount_type?: "discount" | "refund";
  review_status?: "Approved" | "Rejected" | "Under Review" | "Disputed";
  exception_note?: "Credit Note Issued" | "Voided" | "-";
  notes: string | null;
  entered_by: string;
  created_at: string;
  file_url: string | null;
  file_name: string | null;
  received_date: string | null;
  payment_status: string;
  amount_paid: number;
  remaining_balance: number;
  payment_method: string | null;
  dispute_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  has_disputes?: boolean | null;
  disputed_amount?: number | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  line_items?: InvoiceLineItem[];
}

export function useInvoiceData() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = React.useRef(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setInvoices([]); setSuppliers([]); setCategories([]); setLoading(false); return; }
    if (!initialLoadDone.current) setLoading(true);
    const [invData, supData, catRes] = await Promise.all([
      fetchAllRows("invoices", "*", { col: "invoice_date", asc: false }, tenantId),
      fetchAllRows("suppliers", "*", { col: "name", asc: true }, tenantId),
      supabase.from("expense_categories").select("*").eq("tenant_id", tenantId).order("name"),
    ]);

    setSuppliers(supData as Supplier[]);
    if (catRes.data) setCategories(catRes.data as ExpenseCategory[]);

    const supplierMap = new Map(supData.map((s: any) => [s.id, s.name]));
    setInvoices(
      invData.map((inv: any) => ({
        ...inv,
        supplier_name: supplierMap.get(inv.supplier_id) || "Unknown",
      }))
    );
    setLoading(false);
    initialLoadDone.current = true;
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchAll(); }, [fetchAll, tenantLoading]);

  const fetchLineItems = useCallback(async (invoiceId: string): Promise<InvoiceLineItem[]> => {
    if (!tenantId) return [];
    const { data } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("invoice_id", invoiceId)
      .order("created_at");

    if (!data) return [];
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    return (data as any[]).map((li) => ({
      ...li,
      category_name: li.category_id ? catMap.get(li.category_id) || "" : "",
    }));
  }, [categories, tenantId]);

  const syncLineItemsToInventory = useCallback(async (lineItems: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[]) => {
    if (!tenantId) return;
    const invItems = await fetchAllRows("inventory_items", "id, name, current_qty", undefined, tenantId);
    const itemMap = new Map(invItems.map((i: any) => [i.name.trim().toLowerCase(), i]));

    for (const li of lineItems) {
      const desc = (li.description || "").trim();
      if (!desc) continue;
      const key = desc.toLowerCase();
      const qty = Number(li.quantity) || 0;

      const existing = itemMap.get(key);
      if (existing) {
        await supabase.from("inventory_items").update({
          current_qty: (Number(existing.current_qty) || 0) + qty,
        } as any).eq("id", existing.id).eq("tenant_id", tenantId);
        existing.current_qty = (Number(existing.current_qty) || 0) + qty;
      } else {
        const { data: newItem } = await supabase.from("inventory_items").insert({
          name: desc,
          unit_of_measure: li.unit || "unit",
          unit_size: li.pack_size || "",
          current_qty: qty,
          category_id: li.category_id || null,
          is_active: true,
          tenant_id: tenantId,
        } as any).select("id, name, current_qty").single();
        if (newItem) itemMap.set(key, newItem);
      }
    }
  }, [tenantId]);

  const matchLineItemsToProductMaster = useCallback(async (lineItems: any[]) => {
    if (!tenantId) return lineItems;
    const [pmData, psData] = await Promise.all([
      fetchAllRows("product_master", "id, supplier_product_name, internal_product_name, external_sku, internal_sku", undefined, tenantId),
      fetchAllRows("product_suppliers", "id, product_master_id, supplier, external_sku, supplier_product_name", undefined, tenantId),
    ]);
    if (pmData.length === 0 && psData.length === 0) return lineItems;

    const entries: Array<{ id: string; external_sku: string; supplier_product_name: string; internal_product_name: string; internal_sku: string; supplier?: string }> = [];
    for (const p of pmData) {
      const supplierEntries = psData.filter((s: any) => s.product_master_id === p.id);
      if (supplierEntries.length > 0) {
        for (const s of supplierEntries) {
          entries.push({
            id: p.id,
            external_sku: s.external_sku || p.external_sku || "",
            supplier_product_name: s.supplier_product_name || p.supplier_product_name || "",
            internal_product_name: p.internal_product_name || "",
            internal_sku: p.internal_sku || "",
            supplier: s.supplier || "",
          });
        }
      } else {
        entries.push({
          id: p.id,
          external_sku: p.external_sku || "",
          supplier_product_name: p.supplier_product_name || "",
          internal_product_name: p.internal_product_name || "",
          internal_sku: p.internal_sku || "",
        });
      }
    }

    return lineItems.map((li: any) => {
      if (li.product_master_id) return li;

      const itemCode = (li.item_code || "").trim().toLowerCase();
      const desc = (li.description || "").trim().toLowerCase();

      let match: any = null;
      if (itemCode) {
        match = entries.find(e => (e.external_sku || "").trim().toLowerCase() === itemCode);
      }

      if (!match && desc) {
        match = entries.find(e => {
          const spn = (e.supplier_product_name || "").trim().toLowerCase();
          return spn && (spn === desc || desc.includes(spn) || spn.includes(desc));
        });
      }

      if (!match && desc) {
        match = entries.find(e => {
          const ipn = (e.internal_product_name || "").trim().toLowerCase();
          return ipn && (ipn === desc || desc.includes(ipn) || ipn.includes(desc));
        });
      }

      return { ...li, product_master_id: match ? match.id : null };
    });
  }, [tenantId]);

  const createInvoice = useCallback(async (
    invoice: Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items" | "file_url" | "file_name" | "received_date" | "payment_status" | "amount_paid" | "remaining_balance" | "payment_method" | "dispute_notes" | "verified_by" | "verified_at" | "approved_by" | "approved_at"> & Partial<Pick<Invoice, "received_date" | "payment_status" | "amount_paid" | "remaining_balance" | "payment_method" | "dispute_notes" | "verified_by" | "verified_at" | "approved_by" | "approved_at">>,
    lineItems: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[],
    fileUrl?: string | null,
    fileName?: string | null
  ) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("invoices").insert({ ...invoice, file_url: fileUrl || null, file_name: fileName || null, tenant_id: tenantId } as any).select().single();
    if (error) {
      const isDup = (error as any).code === "23505" || /duplicate key|invoices_supplier_invoice_number_uniq/i.test(error.message || "");
      toast({
        title: isDup ? "Duplicate invoice blocked" : "Error",
        description: isDup
          ? `Invoice #${invoice.invoice_number} already exists for this supplier. Duplicates are not allowed.`
          : error.message,
        variant: "destructive",
      });
      return null;
    }

    if (lineItems.length > 0) {
      const matchedItems = await matchLineItemsToProductMaster(
        lineItems.map((li) => ({ ...li, invoice_id: data.id, tenant_id: tenantId }))
      );
      const { error: liErr } = await supabase.from("invoice_line_items").insert(matchedItems as any);
      if (liErr) toast({ title: "Error adding line items", description: liErr.message, variant: "destructive" });

      await syncLineItemsToInventory(lineItems);
    }
    await fetchAll();
    return data;
  }, [fetchAll, toast, syncLineItemsToInventory, matchLineItemsToProductMaster, tenantId]);

  const updateInvoice = useCallback(async (
    id: string,
    updates: Partial<Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items" | "file_url" | "file_name">>,
    lineItems?: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[]
  ) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("invoices").update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }

    if (lineItems !== undefined) {
      await supabase.from("invoice_line_items").delete().eq("invoice_id", id).eq("tenant_id", tenantId);
      if (lineItems.length > 0) {
        const items = lineItems.map((li) => ({ ...li, invoice_id: id, tenant_id: tenantId }));
        const { error: liErr } = await supabase.from("invoice_line_items").insert(items as any);
        if (liErr) { toast({ title: "Error updating line items", description: liErr.message, variant: "destructive" }); return false; }
      }
    }
    await fetchAll();
    return true;
  }, [fetchAll, toast, tenantId]);

  const deleteInvoice = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const invoiceToDelete = invoices.find((inv) => inv.id === id);
    if (invoiceToDelete?.file_url) {
      await supabase.storage.from("invoice-files").remove([invoiceToDelete.file_url]);
    }
    await supabase.from("invoice_line_items").delete().eq("invoice_id", id).eq("tenant_id", tenantId);
    const { error } = await supabase.from("invoices").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    toast({ title: "Invoice deleted" });
    return true;
  }, [fetchAll, toast, invoices, tenantId]);

  const updateInvoiceStatus = useCallback(async (id: string, status: string, metadata?: { verified_by?: string; verified_at?: string; approved_by?: string; approved_at?: string }) => {
    if (!tenantId) return;
    const updates: any = { status, ...metadata };
    const { error } = await supabase.from("invoices").update(updates).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await fetchAll();
  }, [fetchAll, toast, tenantId]);

  const createSupplier = useCallback(async (supplier: Omit<Supplier, "id">) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("suppliers").insert({ ...supplier, tenant_id: tenantId } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast, tenantId]);

  const createCategory = useCallback(async (name: string, description?: string) => {
    if (!tenantId) return null;
    const { data, error } = await supabase.from("expense_categories").insert({ name, description, tenant_id: tenantId } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast, tenantId]);

  return {
    invoices, suppliers, categories, loading,
    fetchAll, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus,
    createSupplier, createCategory,
  };
}
