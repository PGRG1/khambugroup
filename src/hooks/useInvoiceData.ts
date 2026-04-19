import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useToast } from "@/hooks/use-toast";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payment_terms: string | null;
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
  line_items?: InvoiceLineItem[];
}

export function useInvoiceData() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = React.useRef(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    if (!initialLoadDone.current) setLoading(true);
    const [invData, supData, catRes] = await Promise.all([
      fetchAllRows("invoices", "*", { col: "invoice_date", asc: false }),
      fetchAllRows("suppliers", "*", { col: "name", asc: true }),
      supabase.from("expense_categories").select("*").order("name"),
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
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchLineItems = useCallback(async (invoiceId: string): Promise<InvoiceLineItem[]> => {
    const { data } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at");

    if (!data) return [];
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    return (data as any[]).map((li) => ({
      ...li,
      category_name: li.category_id ? catMap.get(li.category_id) || "" : "",
    }));
  }, [categories]);

  const syncLineItemsToInventory = useCallback(async (lineItems: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[]) => {
    // Fetch current inventory items
    const invItems = await fetchAllRows("inventory_items", "id, name, current_qty");
    const itemMap = new Map(invItems.map((i: any) => [i.name.trim().toLowerCase(), i]));

    for (const li of lineItems) {
      const desc = (li.description || "").trim();
      if (!desc) continue;
      const key = desc.toLowerCase();
      const qty = Number(li.quantity) || 0;

      const existing = itemMap.get(key);
      if (existing) {
        // Add purchased qty to current stock
        await supabase.from("inventory_items").update({
          current_qty: (Number(existing.current_qty) || 0) + qty,
        } as any).eq("id", existing.id);
        // Update local map for subsequent items in same batch
        existing.current_qty = (Number(existing.current_qty) || 0) + qty;
      } else {
        // Create new inventory item from invoice line
        const { data: newItem } = await supabase.from("inventory_items").insert({
          name: desc,
          unit_of_measure: li.unit || "unit",
          unit_size: li.pack_size || "",
          current_qty: qty,
          category_id: li.category_id || null,
          is_active: true,
        } as any).select("id, name, current_qty").single();
        if (newItem) itemMap.set(key, newItem);
      }
    }
  }, []);

  const matchLineItemsToProductMaster = useCallback(async (lineItems: any[]) => {
    // Fetch all product master and supplier entries
    const [pmData, psData] = await Promise.all([
      fetchAllRows("product_master", "id, supplier_product_name, internal_product_name, external_sku, internal_sku"),
      fetchAllRows("product_suppliers", "id, product_master_id, supplier, external_sku, supplier_product_name"),
    ]);
    if (pmData.length === 0 && psData.length === 0) return lineItems;

    // Build flattened entries similar to the UI
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

      // Priority 1: Exact external SKU match
      let match: any = null;
      if (itemCode) {
        match = entries.find(e => (e.external_sku || "").trim().toLowerCase() === itemCode);
      }

      // Priority 2: Exact name match
      if (!match && desc) {
        match = entries.find(e => {
          const spn = (e.supplier_product_name || "").trim().toLowerCase();
          return spn && (spn === desc || desc.includes(spn) || spn.includes(desc));
        });
      }

      // Priority 3: Internal product name
      if (!match && desc) {
        match = entries.find(e => {
          const ipn = (e.internal_product_name || "").trim().toLowerCase();
          return ipn && (ipn === desc || desc.includes(ipn) || ipn.includes(desc));
        });
      }

      return { ...li, product_master_id: match ? match.id : null };
    });
  }, []);

  const createInvoice = useCallback(async (
    invoice: Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items" | "file_url" | "file_name" | "received_date" | "payment_status" | "amount_paid" | "remaining_balance" | "payment_method" | "dispute_notes" | "verified_by" | "verified_at" | "approved_by" | "approved_at"> & Partial<Pick<Invoice, "received_date" | "payment_status" | "amount_paid" | "remaining_balance" | "payment_method" | "dispute_notes" | "verified_by" | "verified_at" | "approved_by" | "approved_at">>,
    lineItems: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[],
    fileUrl?: string | null,
    fileName?: string | null
  ) => {
    const { data, error } = await supabase.from("invoices").insert({ ...invoice, file_url: fileUrl || null, file_name: fileName || null } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }

    if (lineItems.length > 0) {
      // Match line items against product master
      const matchedItems = await matchLineItemsToProductMaster(
        lineItems.map((li) => ({ ...li, invoice_id: data.id }))
      );
      const { error: liErr } = await supabase.from("invoice_line_items").insert(matchedItems as any);
      if (liErr) toast({ title: "Error adding line items", description: liErr.message, variant: "destructive" });

      // Sync to inventory
      await syncLineItemsToInventory(lineItems);
    }
    await fetchAll();
    return data;
  }, [fetchAll, toast, syncLineItemsToInventory, matchLineItemsToProductMaster]);

  const updateInvoice = useCallback(async (
    id: string,
    updates: Partial<Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items" | "file_url" | "file_name">>,
    lineItems?: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[]
  ) => {
    const { error } = await supabase.from("invoices").update(updates as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }

    if (lineItems !== undefined) {
      // Delete existing line items and re-insert
      await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
      if (lineItems.length > 0) {
        const items = lineItems.map((li) => ({ ...li, invoice_id: id }));
        const { error: liErr } = await supabase.from("invoice_line_items").insert(items as any);
        if (liErr) { toast({ title: "Error updating line items", description: liErr.message, variant: "destructive" }); return false; }
      }
    }
    await fetchAll();
    return true;
  }, [fetchAll, toast]);

  const deleteInvoice = useCallback(async (id: string) => {
    // Find the invoice to get file_url before deleting
    const invoiceToDelete = invoices.find((inv) => inv.id === id);

    // Delete storage file if exists
    if (invoiceToDelete?.file_url) {
      await supabase.storage.from("invoice-files").remove([invoiceToDelete.file_url]);
    }

    // Delete line items first (FK constraint)
    await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    toast({ title: "Invoice deleted" });
    return true;
  }, [fetchAll, toast, invoices]);

  const updateInvoiceStatus = useCallback(async (id: string, status: string, metadata?: { verified_by?: string; verified_at?: string; approved_by?: string; approved_at?: string }) => {
    const updates: any = { status, ...metadata };
    const { error } = await supabase.from("invoices").update(updates).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await fetchAll();
  }, [fetchAll, toast]);

  const createSupplier = useCallback(async (supplier: Omit<Supplier, "id">) => {
    const { data, error } = await supabase.from("suppliers").insert(supplier as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast]);

  const createCategory = useCallback(async (name: string, description?: string) => {
    const { data, error } = await supabase.from("expense_categories").insert({ name, description } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    await fetchAll();
    return data;
  }, [fetchAll, toast]);

  return {
    invoices, suppliers, categories, loading,
    fetchAll, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus,
    createSupplier, createCategory,
  };
}
