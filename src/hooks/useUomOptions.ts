import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type UomType = "base" | "stock" | "purchase";

export interface UomOption {
  id: string;
  code: string;
  label: string;
  uom_type: UomType;
  sort_order: number;
  is_active: boolean;
}

export function useUomOptions() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [items, setItems] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("uom_options" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("uom_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });
    if (error) toast.error(`Failed to load UOM options: ${error.message}`);
    else setItems((data as unknown as UomOption[]) ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchAll(); }, [fetchAll, tenantLoading]);

  const createItem = useCallback(async (input: { code: string; label: string; uom_type: UomType; sort_order?: number }) => {
    if (!tenantId) return null;
    const code = input.code.trim();
    const label = input.label.trim();
    if (!code || !label) { toast.error("Code and label are required"); return null; }
    const { data, error } = await supabase
      .from("uom_options" as any)
      .insert({ code, label, uom_type: input.uom_type, sort_order: input.sort_order ?? 0, tenant_id: tenantId } as any)
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") toast.error(`"${code}" already exists in this UOM type`);
      else toast.error(`Failed: ${error.message}`);
      return null;
    }
    await fetchAll();
    return data as unknown as UomOption;
  }, [fetchAll, tenantId]);

  const updateItem = useCallback(async (id: string, updates: Partial<Omit<UomOption, "id">>) => {
    if (!tenantId) return;
    const { error } = await supabase.from("uom_options" as any).update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  const deleteItem = useCallback(async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("uom_options" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  return { items, loading, fetchAll, createItem, updateItem, deleteItem };
}

// Helper: merge db UOM list with any free-text legacy values found in product data,
// so existing free-text values still appear in dropdowns until normalized.
export function mergeWithLegacy(options: UomOption[], type: UomType, legacyValues: string[]): { code: string; label: string; legacy: boolean }[] {
  const dbItems = options.filter(o => o.uom_type === type && o.is_active).map(o => ({ code: o.code, label: o.label, legacy: false }));
  const dbCodes = new Set(dbItems.map(i => i.code.toLowerCase()));
  const extras = Array.from(new Set(legacyValues.map(v => (v ?? "").trim()).filter(v => v && !dbCodes.has(v.toLowerCase()))))
    .map(code => ({ code, label: `${code} (legacy)`, legacy: true }));
  return [...dbItems, ...extras];
}
