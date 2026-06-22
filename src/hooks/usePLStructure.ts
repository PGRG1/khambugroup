import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type PLRowKind = "section" | "item" | "sum" | "spacer";

export interface PLStructureRow {
  id: string;
  kind: PLRowKind;
  label: string;
  sort_order: number;
  indent: number;
  is_bold: boolean;
}

export function usePLStructure() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<PLStructureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("pl_structure_rows")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (!error && data) setRows(data as PLStructureRow[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchRows(); }, [fetchRows, tenantLoading]);

  return { rows, loading, refetch: fetchRows };
}
