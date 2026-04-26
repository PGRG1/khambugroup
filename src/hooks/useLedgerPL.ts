import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import type { ChartAccount } from "@/hooks/useChartOfAccounts";

export interface LedgerPLPeriod {
  id: string;
  label: string;
  months: number[];
  year: number;
}

interface JLine {
  account_id: string;
  debit: number;
  credit: number;
  venue: string | null;
  entry_id: string;
}
interface JEntry {
  id: string;
  entry_date: string;
  status: string;
}

/**
 * Aggregates posted journal lines for P&L accounts only,
 * by account, per period, optionally per venue.
 *
 * Returned amount sign convention (P&L display):
 *   Revenue / other_income: credit - debit  (positive = income)
 *   COGS / opex / other_expense: debit - credit (positive = expense)
 */
export function useLedgerPL(periods: LedgerPLPeriod[]) {
  const [entries, setEntries] = useState<JEntry[]>([]);
  const [lines, setLines] = useState<JLine[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (periods.length === 0) return { from: "2000-01-01", to: "2099-12-31" };
    const all = periods.flatMap(p => p.months.map(m => ({ y: p.year, m })));
    all.sort((a, b) => a.y * 100 + a.m - (b.y * 100 + b.m));
    const f = all[0], l = all[all.length - 1];
    const lastDay = new Date(l.y, l.m, 0).getDate();
    return {
      from: `${f.y}-${String(f.m).padStart(2, "0")}-01`,
      to: `${l.y}-${String(l.m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [periods]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [entRes, accRes] = await Promise.all([
      supabase
        .from("journal_entries" as any)
        .select("id,entry_date,status")
        .eq("status", "posted")
        .gte("entry_date", range.from)
        .lte("entry_date", range.to)
        .limit(10000),
      supabase
        .from("chart_of_accounts" as any)
        .select("*")
        .order("code", { ascending: true }),
    ]);
    const ents = ((entRes.data as unknown) as JEntry[]) ?? [];
    setEntries(ents);
    setAccounts(((accRes.data as unknown) as ChartAccount[]) ?? []);
    if (ents.length === 0) {
      setLines([]);
      setLoading(false);
      return;
    }
    const ids = new Set(ents.map(e => e.id));
    const all = await fetchAllRows("journal_lines", "account_id,debit,credit,venue,entry_id");
    setLines((all as JLine[]).filter(l => ids.has(l.entry_id)));
    setLoading(false);
  }, [range.from, range.to]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const entryDate = useMemo(() => {
    const m = new Map<string, string>();
    entries.forEach(e => m.set(e.id, e.entry_date));
    return m;
  }, [entries]);

  const plAccountIds = useMemo(() => {
    return new Set(
      accounts
        .filter(a => ["revenue", "cogs", "opex", "other_income", "other_expense"].includes(a.account_type))
        .map(a => a.id)
    );
  }, [accounts]);

  /**
   * Returns: Map<periodId, Map<accountId, Map<venue|"__total__", amount>>>
   */
  const data = useMemo(() => {
    const result = new Map<string, Map<string, Map<string, number>>>();
    for (const p of periods) result.set(p.id, new Map());

    const periodLookup = (date: string): string | null => {
      const [yStr, mStr] = date.split("-");
      const y = Number(yStr), m = Number(mStr);
      for (const p of periods) {
        if (p.year === y && p.months.includes(m)) return p.id;
      }
      return null;
    };

    const sideOf = (acctId: string): 1 | -1 | 0 => {
      const a = accounts.find(x => x.id === acctId);
      if (!a) return 0;
      if (["revenue", "other_income"].includes(a.account_type)) return -1; // credit positive
      if (["cogs", "opex", "other_expense"].includes(a.account_type)) return 1; // debit positive
      return 0;
    };

    for (const ln of lines) {
      if (!plAccountIds.has(ln.account_id)) continue;
      const date = entryDate.get(ln.entry_id);
      if (!date) continue;
      const pid = periodLookup(date);
      if (!pid) continue;
      const sign = sideOf(ln.account_id);
      if (sign === 0) continue;
      const amt = sign === 1 ? Number(ln.debit) - Number(ln.credit) : Number(ln.credit) - Number(ln.debit);
      if (amt === 0) continue;

      const periodMap = result.get(pid)!;
      let acctMap = periodMap.get(ln.account_id);
      if (!acctMap) { acctMap = new Map(); periodMap.set(ln.account_id, acctMap); }
      const venue = ln.venue || "Unassigned";
      acctMap.set(venue, (acctMap.get(venue) || 0) + amt);
      acctMap.set("__total__", (acctMap.get("__total__") || 0) + amt);
    }
    return result;
  }, [lines, entryDate, periods, plAccountIds, accounts]);

  const venues = useMemo(() => {
    const s = new Set<string>();
    for (const periodMap of data.values()) {
      for (const acctMap of periodMap.values()) {
        for (const v of acctMap.keys()) if (v !== "__total__") s.add(v);
      }
    }
    return [...s].sort();
  }, [data]);

  return { accounts, data, venues, loading, refetch: fetchAll };
}
