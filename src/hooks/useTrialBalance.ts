import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  normal_side: "debit" | "credit";
  total_debit: number;
  total_credit: number;
  balance: number;
}

export function useTrialBalance(opts?: { fromDate?: string; toDate?: string }) {
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // If date filters provided, compute from journal_lines + entries client-side
      if (opts?.fromDate || opts?.toDate) {
        let q: any = supabase.from("journal_lines" as any).select("account_id,debit,credit,journal_entries!inner(entry_date,status)");
        const { data, error } = await q.limit(10000);
        if (error || !data) { setRows([]); setLoading(false); return; }
        const accRes = await supabase.from("chart_of_accounts" as any).select("*").order("code");
        const accs = (accRes.data as any[]) ?? [];
        const map = new Map<string, { d: number; c: number }>();
        (data as any[]).forEach((l) => {
          const e = l.journal_entries;
          if (!e || e.status !== "posted") return;
          if (opts.fromDate && e.entry_date < opts.fromDate) return;
          if (opts.toDate && e.entry_date > opts.toDate) return;
          const cur = map.get(l.account_id) || { d: 0, c: 0 };
          cur.d += Number(l.debit) || 0;
          cur.c += Number(l.credit) || 0;
          map.set(l.account_id, cur);
        });
        const out: TrialBalanceRow[] = accs.map((a) => {
          const m = map.get(a.id) || { d: 0, c: 0 };
          const bal = a.normal_side === "debit" ? m.d - m.c : m.c - m.d;
          return {
            account_id: a.id, code: a.code, name: a.name, account_type: a.account_type,
            normal_side: a.normal_side, total_debit: m.d, total_credit: m.c, balance: bal,
          };
        });
        if (!cancelled) setRows(out);
      } else {
        const { data, error } = await supabase.from("v_trial_balance" as any).select("*");
        if (!error && !cancelled) setRows(((data as unknown) as TrialBalanceRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [opts?.fromDate, opts?.toDate]);

  return { rows, loading };
}
