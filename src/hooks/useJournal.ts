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

  const createManualEntry = useCallback(async (input: { entry_date: string; memo: string; lines: JournalLineDraft[] }) => {
    if (input.lines.length < 2) { toast.error("At least 2 lines required"); return null; }
    const totalDebit = input.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = input.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      toast.error(`Not balanced: Dr ${totalDebit.toFixed(2)} ≠ Cr ${totalCredit.toFixed(2)}`);
      return null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: ent, error: e1 } = await supabase
      .from("journal_entries" as any)
      .insert({ entry_date: input.entry_date, memo: input.memo, source_type: "manual", status: "draft", created_by: user?.id ?? null } as any)
      .select().single();
    if (e1) { toast.error(e1.message); return null; }
    const eid = (ent as any).id;
    const { error: e2 } = await supabase.from("journal_lines" as any).insert(
      input.lines.map((l, i) => ({
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

  return { entries, lines, loading, fetchAll, createManualEntry, voidEntry, rebuildFromOperations };
}
