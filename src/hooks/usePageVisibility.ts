import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface PageVisibility {
  page_key: string;
  page_label: string;
  visible_to_all: boolean;
}

export function usePageVisibility() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [pages, setPages] = useState<PageVisibility[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!tenantId) { setPages([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("page_visibility")
      .select("page_key, page_label, visible_to_all")
      .eq("tenant_id", tenantId)
      .order("page_key");
    if (!error && data) setPages(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetch(); }, [fetch, tenantLoading]);

  const toggleVisibility = useCallback(async (pageKey: string, visible: boolean) => {
    if (!tenantId) return;
    await supabase
      .from("page_visibility")
      .update({ visible_to_all: visible })
      .eq("page_key", pageKey)
      .eq("tenant_id", tenantId);
    await fetch();
  }, [fetch, tenantId]);

  const isPageVisible = useCallback((pageKey: string, isAdmin: boolean) => {
    if (isAdmin) return true;
    const page = pages.find(p => p.page_key === pageKey);
    return page ? page.visible_to_all : true;
  }, [pages]);

  return { pages, loading, toggleVisibility, isPageVisible, refetch: fetch };
}
