import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";

export type ARAccount = { id: string; code: string; name: string };
export type AROpenItem = {
  line_id: string;
  entry_id: string;
  entry_date: string;
  account_id: string;
  account_code: string;
  account_name: string;
  venue: string | null;
  memo: string;
  original_amount: number;
  open_amount: number;
  age_days: number;
};
export type ARAccountSummary = {
  id: string;
  code: string;
  name: string;
  outstanding: number;
  last_activity: string | null;
  open_count: number;
};

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1–30", min: 1, max: 30 },
  { label: "31–60", min: 31, max: 60 },
  { label: "61–90", min: 61, max: 90 },
  { label: "90+", min: 91, max: Infinity },
] as const;

export function bucketOf(days: number): string {
  for (const b of BUCKETS) if (days >= b.min && days <= b.max) return b.label;
  return "90+";
}
export const AGE_BUCKETS = BUCKETS.map((b) => b.label);

export function useReceivables() {
  const [accounts, setAccounts] = useState<ARAccount[]>([]);
  const [openItems, setOpenItems] = useState<AROpenItem[]>([]);
  const [summary, setSummary] = useState<ARAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // AR accounts: assets matching merchant receivable / accounts receivable
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, is_active")
        .eq("account_type", "asset")
        .eq("is_active", true)
        .order("code");

      const arAccs = (accs || []).filter(
        (a: any) =>
          /receivable/i.test(a.name) ||
          a.code === "1100" ||
          a.code === "1110"
      );
      setAccounts(arAccs.map((a: any) => ({ id: a.id, code: a.code, name: a.name })));

      if (arAccs.length === 0) {
        setOpenItems([]);
        setSummary([]);
        setLoading(false);
        return;
      }

      const arIds = new Set(arAccs.map((a: any) => a.id));
      const lines = await fetchAllRows(
        "journal_lines",
        "id, entry_id, account_id, debit, credit, venue, memo, journal_entries!inner(entry_date, status)",
      );

      // Filter to AR-account lines from posted entries
      const arLines = (lines || []).filter(
        (l: any) => arIds.has(l.account_id) && (l.journal_entries?.status === "posted")
      );

      // Group by account, FIFO match credits against debits
      const today = new Date();
      const byAcc = new Map<string, any[]>();
      for (const l of arLines) {
        const arr = byAcc.get(l.account_id) || [];
        arr.push({
          ...l,
          entry_date: l.journal_entries.entry_date,
        });
        byAcc.set(l.account_id, arr);
      }

      const open: AROpenItem[] = [];
      const summaryArr: ARAccountSummary[] = [];

      for (const acc of arAccs as any[]) {
        const arr = (byAcc.get(acc.id) || []).sort((a: any, b: any) =>
          a.entry_date.localeCompare(b.entry_date)
        );
        // Build queue of debit lots
        const debitLots: any[] = [];
        let creditPool = 0;
        let lastActivity: string | null = null;
        for (const l of arr) {
          if (!lastActivity || l.entry_date > lastActivity) lastActivity = l.entry_date;
          const d = Number(l.debit) || 0;
          const c = Number(l.credit) || 0;
          if (d > 0) debitLots.push({ ...l, remaining: d, original: d });
          if (c > 0) creditPool += c;
        }
        // Apply credits FIFO
        for (const lot of debitLots) {
          if (creditPool <= 0) break;
          const apply = Math.min(creditPool, lot.remaining);
          lot.remaining -= apply;
          creditPool -= apply;
        }
        let outstanding = 0;
        let openCount = 0;
        for (const lot of debitLots) {
          if (lot.remaining > 0.005) {
            const ageDays = Math.floor(
              (today.getTime() - new Date(lot.entry_date).getTime()) / 86400000
            );
            open.push({
              line_id: lot.id,
              entry_id: lot.entry_id,
              entry_date: lot.entry_date,
              account_id: acc.id,
              account_code: acc.code,
              account_name: acc.name,
              venue: lot.venue,
              memo: lot.memo || "",
              original_amount: lot.original,
              open_amount: Math.round(lot.remaining * 100) / 100,
              age_days: ageDays,
            });
            outstanding += lot.remaining;
            openCount++;
          }
        }
        summaryArr.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          outstanding: Math.round(outstanding * 100) / 100,
          last_activity: lastActivity,
          open_count: openCount,
        });
      }

      open.sort((a, b) => b.age_days - a.age_days);
      setOpenItems(open);
      setSummary(summaryArr);
      setLoading(false);
    })();
  }, [refreshKey]);

  return { accounts, openItems, summary, loading, refresh };
}
