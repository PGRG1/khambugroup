import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AssetClassKey = "kitchen_equipment" | "furniture_fixtures" | "it_equipment" | "leasehold_improvements";
export type AssetClass = { id: string; class_key: AssetClassKey; name: string; asset_account_id: string | null; useful_years: number; sort_order: number };
export type AssetSettings = { threshold: number; accum_account_id: string | null; expense_account_id: string | null };
export type AssetPolicy = { settings: AssetSettings | null; classes: AssetClass[] };

/** Load a client's asset policy (made with defaults from its chart the first time). */
export async function loadAssetPolicy(tenantId: string): Promise<AssetPolicy> {
  const db = supabase as any;
  await db.rpc("ensure_asset_policy", { p_tenant: tenantId });
  const [s, c] = await Promise.all([
    db.from("asset_settings").select("threshold,accum_account_id,expense_account_id").eq("tenant_id", tenantId).maybeSingle(),
    db.from("asset_classes").select("id,class_key,name,asset_account_id,useful_years,sort_order").eq("tenant_id", tenantId).order("sort_order"),
  ]);
  return { settings: s.data ? { ...s.data, threshold: Number(s.data.threshold) } : null, classes: (c.data ?? []) as AssetClass[] };
}

export function useAssetPolicy(tenantId: string | null | undefined) {
  const [policy, setPolicy] = useState<AssetPolicy>({ settings: null, classes: [] });
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try { setPolicy(await loadAssetPolicy(tenantId)); } finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { void refetch(); }, [refetch]);
  const db = supabase as any;
  const saveSettings = async (patch: Partial<AssetSettings>) => {
    const { error } = await db.from("asset_settings").update(patch).eq("tenant_id", tenantId);
    if (!error) await refetch();
    return error?.message ?? null;
  };
  const saveClasses = async (rows: Pick<AssetClass, "id" | "asset_account_id" | "useful_years">[]) => {
    for (const r of rows) {
      const { error } = await db.from("asset_classes").update({ asset_account_id: r.asset_account_id, useful_years: r.useful_years }).eq("id", r.id).eq("tenant_id", tenantId);
      if (error) return error.message as string;
    }
    await refetch();
    return null;
  };
  return { ...policy, loading, refetch, saveSettings, saveClasses };
}

const KEYS: [AssetClassKey, RegExp][] = [
  ["it_equipment", /computer|laptop|server|printer|pos\b|pos terminal|tablet|ipad|router|network|cctv|camera|monitor/i],
  ["leasehold_improvements", /fit[- ]?out|renovat|leasehold|partition|ceiling|flooring|signage|installation works/i],
  ["furniture_fixtures", /furniture|fixture|table|chair|stool|sofa|counter|shelv|cabinet|booth/i],
  ["kitchen_equipment", /kitchen|fridge|freezer|refrigerat|chiller|oven|stove|range|fryer|grill|dishwasher|ice machine|製冰|coffee machine|espresso|blender|mixer|hood|equipment|appliance/i],
];
/** Which asset class a bill line is, from what it says. Kitchen equipment when it only says "equipment". */
export function assetClassOf(text: string): AssetClassKey {
  return KEYS.find(([, re]) => re.test(text))?.[0] ?? "kitchen_equipment";
}
