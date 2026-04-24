import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AccountingCategory {
  id: string;
  name: string;
  statement: string; // 'P&L' | 'Balance Sheet'
  category_group: string; // 'COGS' | 'OpEx' | 'Asset' | etc.
  sort_order: number;
  is_active: boolean;
}

export function useAccountingCategories() {
  const [items, setItems] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("accounting_categories" as any)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error(`Failed to load accounting categories: ${error.message}`);
    else setItems((data as unknown as AccountingCategory[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createItem = useCallback(async (input: { name: string; statement: string; category_group: string; sort_order?: number }) => {
    const name = input.name.trim();
    if (!name) { toast.error("Name is required"); return null; }
    const { data, error } = await supabase
      .from("accounting_categories" as any)
      .insert({ name, statement: input.statement, category_group: input.category_group, sort_order: input.sort_order ?? 0 } as any)
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") toast.error(`"${name}" already exists`);
      else toast.error(`Failed: ${error.message}`);
      return null;
    }
    await fetchAll();
    return data as unknown as AccountingCategory;
  }, [fetchAll]);

  const updateItem = useCallback(async (id: string, updates: Partial<Omit<AccountingCategory, "id">>) => {
    const { error } = await supabase.from("accounting_categories" as any).update(updates as any).eq("id", id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("accounting_categories" as any).delete().eq("id", id);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll]);

  return { items, loading, fetchAll, createItem, updateItem, deleteItem };
}
