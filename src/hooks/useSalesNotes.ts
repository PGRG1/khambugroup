import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface SalesNote { id: string; sales_record_id: string; author_id: string; author_name: string | null; body: string; tag: string | null; created_at: string }

/** Manager notes on sales records for the active tenant. */
export function useSalesNotes() {
  const { tenantId } = useActiveTenant();
  const [notes, setNotes] = useState<SalesNote[]>([]);
  const reload = useCallback(async () => {
    if (!tenantId) { setNotes([]); return; }
    const rows = await fetchAllRows("sales_record_notes", "id,sales_record_id,author_id,author_name,body,tag,created_at", { col: "created_at", asc: true }, tenantId);
    setNotes(rows as SalesNote[]);
  }, [tenantId]);
  useEffect(() => { void reload(); }, [reload]);

  const byRecord = useMemo(() => {
    const m = new Map<string, SalesNote[]>();
    for (const n of notes) m.set(n.sales_record_id, [...(m.get(n.sales_record_id) ?? []), n]);
    return m;
  }, [notes]);

  const addNote = useCallback(async (salesRecordId: string, body: string, tag: string | null) => {
    if (!tenantId || !body.trim()) return false;
    const { error } = await supabase.from("sales_record_notes").insert({ tenant_id: tenantId, sales_record_id: salesRecordId, body: body.trim().slice(0, 1000), tag } as any);
    if (!error) await reload();
    return !error;
  }, [tenantId, reload]);

  /** Find a just-saved record by its natural key, then add the note. */
  const addNoteForDay = useCallback(async (date: string, venue: string, reportNumber: string, body: string, tag: string | null) => {
    if (!tenantId || !body.trim()) return false;
    const { data } = await supabase.from("sales_records").select("id").eq("tenant_id", tenantId)
      .eq("date", date).eq("venue", venue).eq("report_number", reportNumber).order("created_at", { ascending: false }).limit(1);
    const id = data?.[0]?.id;
    return id ? addNote(id, body, tag) : false;
  }, [tenantId, addNote]);

  return { notes, byRecord, addNote, addNoteForDay, reload };
}
