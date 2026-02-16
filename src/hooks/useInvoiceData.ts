import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
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
  tax_amount: number;
  total: number;
  notes: string | null;
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
  notes: string | null;
  entered_by: string;
  created_at: string;
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
    const [invRes, supRes, catRes] = await Promise.all([
      supabase.from("invoices").select("*").order("invoice_date", { ascending: false }),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("expense_categories").select("*").order("name"),
    ]);

    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    if (catRes.data) setCategories(catRes.data as ExpenseCategory[]);

    if (invRes.data) {
      const supplierMap = new Map((supRes.data || []).map((s: any) => [s.id, s.name]));
      setInvoices(
        (invRes.data as any[]).map((inv) => ({
          ...inv,
          supplier_name: supplierMap.get(inv.supplier_id) || "Unknown",
        }))
      );
    }
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
    const { data: invItems } = await supabase.from("inventory_items").select("id, name, current_qty");
    const itemMap = new Map((invItems || []).map((i: any) => [i.name.trim().toLowerCase(), i]));

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

  const createInvoice = useCallback(async (
    invoice: Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items">,
    lineItems: Omit<InvoiceLineItem, "id" | "invoice_id" | "category_name">[]
  ) => {
    const { data, error } = await supabase.from("invoices").insert(invoice as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }

    if (lineItems.length > 0) {
      const items = lineItems.map((li) => ({ ...li, invoice_id: data.id }));
      const { error: liErr } = await supabase.from("invoice_line_items").insert(items as any);
      if (liErr) toast({ title: "Error adding line items", description: liErr.message, variant: "destructive" });

      // Sync to inventory
      await syncLineItemsToInventory(lineItems);
    }
    await fetchAll();
    return data;
  }, [fetchAll, toast, syncLineItemsToInventory]);

  const updateInvoice = useCallback(async (
    id: string,
    updates: Partial<Omit<Invoice, "id" | "created_at" | "supplier_name" | "line_items">>,
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
    // Delete line items first (FK constraint)
    await supabase.from("invoice_line_items").delete().eq("invoice_id", id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return false; }
    await fetchAll();
    toast({ title: "Invoice deleted" });
    return true;
  }, [fetchAll, toast]);

  const updateInvoiceStatus = useCallback(async (id: string, status: string) => {
    const { error } = await supabase.from("invoices").update({ status } as any).eq("id", id);
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
