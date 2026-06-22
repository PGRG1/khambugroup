import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

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
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (opts?.fromDate || opts?.toDate) {
        const [entries, lines, accRes] = await Promise.all([
          fetchAllRows("journal_entries", "id,entry_date,status", undefined, tenantId),
          fetchAllRows("journal_lines", "account_id,entry_id,debit,credit", undefined, tenantId),
          supabase.from("chart_of_accounts" as any).select("*").eq("tenant_id", tenantId).order("code"),
        ]);
        const entryMap = new Map<string, { date: string; status: string }>();
        (entries as any[]).forEach((e) => entryMap.set(e.id, { date: e.entry_date, status: e.status }));
        const accs = (accRes.data as any[]) ?? [];
        const map = new Map<string, { d: number; c: number }>();
        (lines as any[]).forEach((l) => {
          const e = entryMap.get(l.entry_id);
          if (!e || e.status !== "posted") return;
          if (opts.fromDate && e.date < opts.fromDate) return;
          if (opts.toDate && e.date > opts.toDate) return;
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
        // v_trial_balance respects RLS; super-admins must scope by tenant.
        const { data, error } = await supabase.from("v_trial_balance" as any).select("*").eq("tenant_id", tenantId);
        if (!error && !cancelled) setRows(((data as unknown) as TrialBalanceRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [opts?.fromDate, opts?.toDate, tenantId, tenantLoading]);

  return { rows, loading };
}

