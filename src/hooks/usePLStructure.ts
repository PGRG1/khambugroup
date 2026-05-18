import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [rows, setRows] = useState<PLStructureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pl_structure_rows")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) setRows(data as PLStructureRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return { rows, loading, refetch: fetchRows };
}
