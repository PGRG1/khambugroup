import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PageVisibility {
  page_key: string;
  page_label: string;
  visible_to_all: boolean;
}

export function usePageVisibility() {
  const [pages, setPages] = useState<PageVisibility[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from("page_visibility")
      .select("page_key, page_label, visible_to_all")
      .order("page_key");
    if (!error && data) setPages(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleVisibility = useCallback(async (pageKey: string, visible: boolean) => {
    await supabase
      .from("page_visibility")
      .update({ visible_to_all: visible })
      .eq("page_key", pageKey);
    await fetch();
  }, [fetch]);

  const isPageVisible = useCallback((pageKey: string, isAdmin: boolean) => {
    if (isAdmin) return true;
    const page = pages.find(p => p.page_key === pageKey);
    return page ? page.visible_to_all : true;
  }, [pages]);

  return { pages, loading, toggleVisibility, isPageVisible, refetch: fetch };
}
