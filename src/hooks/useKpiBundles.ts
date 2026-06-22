import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface KpiBundle {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface KpiBundleCard {
  id: string;
  bundle_id: string;
  kpi_card_id: string;
  sort_order: number;
}

export function useKpiBundles() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [bundles, setBundles] = useState<KpiBundle[]>([]);
  const [bundleCards, setBundleCards] = useState<KpiBundleCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setBundles([]); setBundleCards([]); setLoading(false); return; }
    setLoading(true);
    const [b, bc] = await Promise.all([
      supabase.from("kpi_bundles" as any).select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("kpi_bundle_cards" as any).select("*").eq("tenant_id", tenantId).order("sort_order"),
    ]);
    if (b.error) toast({ title: "Failed to load bundles", description: b.error.message, variant: "destructive" });
    else setBundles((b.data ?? []) as any);
    if (bc.error) toast({ title: "Failed to load bundle cards", description: bc.error.message, variant: "destructive" });
    else setBundleCards((bc.data ?? []) as any);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  const cardsInBundle = useCallback(
    (bundleId: string) =>
      bundleCards.filter((bc) => bc.bundle_id === bundleId).map((bc) => bc.kpi_card_id),
    [bundleCards],
  );

  return { bundles, bundleCards, loading, reload: load, cardsInBundle };
}
