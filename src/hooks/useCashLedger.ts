import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parallelPages } from "@/utils/parallelPages";

export type BankPeriodClose = { id: string; bank_account_id: string; period_start: string; period_end: string; status: string; locked_at: string | null; difference: number | null; notes: string | null };

/**
 * Posted ledger lines of the bank accounts' linked ledger accounts (and the till cash accounts), with their dates, so a page can
 * say what the books showed on any day (for example the last day of a bank statement). Also reads
 * which bank statement periods are already closed.
 */
export function useCashLedger(tenantId: string | null | undefined, glIds: string[]) {
  const ids = [...new Set(glIds.filter(Boolean))].sort();
  const lines = useQuery({
    queryKey: ["cash-ledger", tenantId, ids.join(",")],
    enabled: !!tenantId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      return parallelPages<{ account_id: string; debit: number; credit: number; venue: string | null; journal_entries: { entry_date: string } }>((a, b) =>
        sb.from("journal_lines").select("account_id,debit,credit,venue,journal_entries!inner(entry_date,status)")
          .eq("tenant_id", tenantId).in("account_id", ids).eq("journal_entries.status", "posted")
          .order("id", { ascending: true }).range(a, b));
    },
  });
  const closes = useQuery({
    queryKey: ["cash-ledger-closes", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bank_reconciliation_periods")
        .select("id,bank_account_id,period_start,period_end,status,locked_at,difference,notes").eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as BankPeriodClose[];
    },
  });
  const rows = lines.data ?? [];
  /** Books balance of one ledger account at the end of `date` (every posted line when no date). */
  const booksOn = (glId: string | null | undefined, date?: string | null): number | null => {
    if (!glId) return null;
    let n = 0;
    for (const r of rows) if (r.account_id === glId && (!date || r.journal_entries.entry_date <= date)) n += Number(r.debit || 0) - Number(r.credit || 0);
    return Math.round(n * 100) / 100;
  };
  /** Books balance of several ledger accounts for one venue (cash in tills), every posted line. */
  const venueBooks = (glIds: Set<string>, venue: string): number => {
    let n = 0;
    for (const r of rows) if (glIds.has(r.account_id) && r.venue === venue) n += Number(r.debit || 0) - Number(r.credit || 0);
    return Math.round(n * 100) / 100;
  };
  const closeFor = (accountId: string, start: string, end: string) =>
    (closes.data ?? []).find(c => c.bank_account_id === accountId && c.status === "closed" && c.period_start === start && c.period_end === end) ?? null;
  return { loading: lines.isLoading || closes.isLoading, booksOn, venueBooks, closeFor, reload: () => { void lines.refetch(); void closes.refetch(); } };
}
