import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface ProductCategory {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useProductCategories() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!tenantId) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      toast.error(`Failed to load categories: ${error.message}`);
    } else {
      setCategories((data as ProductCategory[]) ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading) fetchCategories();
  }, [fetchCategories, tenantLoading]);

  const createCategory = useCallback(
    async (input: { name: string; level: 1 | 2 | 3; parent_id: string | null }) => {
      if (!tenantId) return null;
      const trimmed = input.name.trim();
      if (!trimmed) {
        toast.error("Category name is required");
        return null;
      }
      const { data, error } = await supabase
        .from("product_categories")
        .insert({
          name: trimmed,
          level: input.level,
          parent_id: input.parent_id,
          tenant_id: tenantId,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          toast.error(`"${trimmed}" already exists at this level`);
        } else {
          toast.error(`Failed to create: ${error.message}`);
        }
        return null;
      }
      await fetchCategories();
      return data as ProductCategory;
    },
    [fetchCategories, tenantId]
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      if (!tenantId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from("product_categories")
        .update({ name: trimmed })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        toast.error(`Rename failed: ${error.message}`);
        return;
      }
      await fetchCategories();
    },
    [fetchCategories, tenantId]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!tenantId) return;
      const { error } = await supabase.from("product_categories").delete().eq("id", id).eq("tenant_id", tenantId);
      if (error) {
        toast.error(`Delete failed: ${error.message}`);
        return;
      }
      await fetchCategories();
    },
    [fetchCategories, tenantId]
  );

  const importFromProducts = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from("product_master")
      .select("level1_category, level2_category, level3_category")
      .eq("tenant_id", tenantId);
    if (error) {
      toast.error(`Import failed: ${error.message}`);
      return;
    }
    const rows = (data ?? []) as Array<{
      level1_category: string | null;
      level2_category: string | null;
      level3_category: string | null;
    }>;
    // Re-fetch current to know what already exists
    const { data: existing } = await supabase.from("product_categories").select("*").eq("tenant_id", tenantId);
    const existingRows = (existing as ProductCategory[]) ?? [];

    const findExisting = (name: string, level: 1 | 2 | 3, parent_id: string | null) =>
      existingRows.find(
        (r) =>
          r.level === level &&
          r.parent_id === parent_id &&
          r.name.toLowerCase() === name.toLowerCase()
      );

    const created: ProductCategory[] = [];
    let createdCount = 0;

    const insertOne = async (
      name: string,
      level: 1 | 2 | 3,
      parent_id: string | null
    ): Promise<string | null> => {
      const existing = findExisting(name, level, parent_id) || created.find(
        (r) =>
          r.level === level &&
          r.parent_id === parent_id &&
          r.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) return existing.id;

      const { data: row, error: insErr } = await supabase
        .from("product_categories")
        .insert({ name, level, parent_id, tenant_id: tenantId })
        .select()
        .single();
      if (insErr) return null;
      created.push(row as ProductCategory);
      createdCount++;
      return (row as ProductCategory).id;
    };

    for (const r of rows) {
      const l1 = r.level1_category?.trim();
      const l2 = r.level2_category?.trim();
      const l3 = r.level3_category?.trim();
      if (!l1) continue;
      const l1Id = await insertOne(l1, 1, null);
      if (!l1Id || !l2) continue;
      const l2Id = await insertOne(l2, 2, l1Id);
      if (!l2Id || !l3) continue;
      await insertOne(l3, 3, l2Id);
    }

    toast.success(`Imported ${createdCount} new categor${createdCount === 1 ? "y" : "ies"}`);
    await fetchCategories();
  }, [fetchCategories, tenantId]);

  return {
    categories,
    loading,
    fetchCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    importFromProducts,
  };
}
