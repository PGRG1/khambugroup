import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { toast } from "sonner";

export interface JournalEntry {
  id: string;
  entry_date: string;
  memo: string;
  source_type: string;
  source_id: string | null;
  venue: string | null;
  status: "draft" | "posted" | "void";
  posted_at: string | null;
  created_at: string;
  manually_adjusted?: boolean;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  venue: string | null;
  memo: string;
  line_no: number;
}

export interface JournalLineDraft {
  account_id: string;
  debit: number;
  credit: number;
  memo?: string;
  venue?: string;
}

export function useJournal(filters?: { fromDate?: string; toDate?: string; sourceType?: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    let q: any = supabase.from("journal_entries" as any).select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (filters?.fromDate) q = q.gte("entry_date", filters.fromDate);
    if (filters?.toDate) q = q.lte("entry_date", filters.toDate);
    if (filters?.sourceType && filters.sourceType !== "all") q = q.eq("source_type", filters.sourceType);
    const { data: ents, error } = await q.limit(1000);
    if (error) { toast.error(error.message); setLoading(false); return; }
    setEntries((ents as unknown as JournalEntry[]) ?? []);
    const ids = ((ents as any[]) ?? []).map((e) => e.id);
    if (ids.length === 0) { setLines([]); setLoading(false); return; }
    const allLines = await fetchAllRows("journal_lines", "*");
    setLines((allLines as JournalLine[]).filter((l) => ids.includes(l.entry_id)));
    setLoading(false);
  }, [filters?.fromDate, filters?.toDate, filters?.sourceType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const validateLines = (ls: JournalLineDraft[]): { valid: JournalLineDraft[]; ok: boolean } => {
    const valid = ls.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (valid.length < 2) { toast.error("At least 2 lines required"); return { valid, ok: false }; }
    const td = valid.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const tc = valid.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.round(td * 100) !== Math.round(tc * 100)) {
      toast.error(`Not balanced: Dr ${td.toFixed(2)} ≠ Cr ${tc.toFixed(2)}`);
      return { valid, ok: false };
    }
    return { valid, ok: true };
  };

  const createManualEntry = useCallback(async (input: { entry_date: string; memo: string; lines: JournalLineDraft[] }) => {
    const { valid, ok } = validateLines(input.lines);
    if (!ok) return null;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: ent, error: e1 } = await supabase
      .from("journal_entries" as any)
      .insert({ entry_date: input.entry_date, memo: input.memo, source_type: "manual", status: "draft", created_by: user?.id ?? null } as any)
      .select().single();
    if (e1) { toast.error(e1.message); return null; }
    const eid = (ent as any).id;
    const { error: e2 } = await supabase.from("journal_lines" as any).insert(
      valid.map((l, i) => ({
        entry_id: eid,
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo ?? "",
        venue: l.venue ?? null,
        line_no: i + 1,
      })) as any,
    );
    if (e2) {
      await supabase.from("journal_entries" as any).delete().eq("id", eid);
      toast.error(`Lines failed: ${e2.message}`);
      return null;
    }
    const { error: e3 } = await supabase.from("journal_entries" as any).update({ status: "posted", posted_at: new Date().toISOString() } as any).eq("id", eid);
    if (e3) { toast.error(`Post failed: ${e3.message}`); return null; }
    toast.success("Journal entry posted");
    await fetchAll();
    return eid;
  }, [fetchAll]);

  const updateEntry = useCallback(async (
    id: string,
    input: { entry_date: string; memo: string; lines: JournalLineDraft[] },
    sourceType: string,
  ) => {
    const { valid, ok } = validateLines(input.lines);
    if (!ok) return false;

    // Temporarily mark as draft to avoid trigger firing mid-update
    const { error: eDraft } = await supabase
      .from("journal_entries" as any)
      .update({ status: "draft" } as any)
      .eq("id", id);
    if (eDraft) { toast.error(eDraft.message); return false; }

    // Delete existing lines
    const { error: eDel } = await supabase.from("journal_lines" as any).delete().eq("entry_id", id);
    if (eDel) { toast.error(`Delete lines failed: ${eDel.message}`); return false; }

    // Insert new lines
    const { error: eIns } = await supabase.from("journal_lines" as any).insert(
      valid.map((l, i) => ({
        entry_id: id,
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        memo: l.memo ?? "",
        venue: l.venue ?? null,
        line_no: i + 1,
      })) as any,
    );
    if (eIns) { toast.error(`Insert lines failed: ${eIns.message}`); return false; }

    // Update header + flag manually_adjusted for non-manual entries; repost
    const patch: any = {
      entry_date: input.entry_date,
      memo: input.memo,
      status: "posted",
      posted_at: new Date().toISOString(),
    };
    if (sourceType !== "manual") patch.manually_adjusted = true;

    const { error: eUpd } = await supabase.from("journal_entries" as any).update(patch).eq("id", id);
    if (eUpd) { toast.error(`Update failed: ${eUpd.message}`); return false; }

    // Audit log
    const { data: { user } } = await supabase.auth.getUser();
    let uname: string | null = null;
    if (user?.id) {
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
      uname = (prof as any)?.display_name ?? null;
    }
    await supabase.from("ledger_audit_log" as any).insert({
      event_type: "journal_entry_edited",
      user_id: user?.id ?? null,
      user_display_name: uname,
      journal_entry_id: id,
      status: "success",
      notes: `Edited ${sourceType} entry (${valid.length} lines)`,
    } as any);

    toast.success(sourceType === "manual" ? "Entry updated" : "Entry updated & detached from auto-rebuild");
    await fetchAll();
    return true;
  }, [fetchAll]);

  const restoreAutoEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from("journal_entries" as any)
      .update({ manually_adjusted: false } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Re-attached. Next rebuild will recreate this entry.");
    await fetchAll();
  }, [fetchAll]);

  const voidEntry = useCallback(async (id: string) => {
    const { error } = await supabase.from("journal_entries" as any).update({ status: "void" } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry voided");
    await fetchAll();
  }, [fetchAll]);

  const rebuildFromOperations = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("rebuild_journal_from_operations");
    if (error) { toast.error(`Rebuild failed: ${error.message}`); return; }
    toast.success(`Ledger rebuilt — ${(data as any)?.entries_created ?? 0} entries`);
    await fetchAll();
  }, [fetchAll]);

  return { entries, lines, loading, fetchAll, createManualEntry, updateEntry, restoreAutoEntry, voidEntry, rebuildFromOperations };
}
