import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookAccount, BookEntry, BookLine, MonthCheck } from "@/utils/financeClose";
import type { FinanceBank, FinanceBatch } from "@/utils/financeOverview";
import { parallelPages } from "@/utils/parallelPages";

// Home only needs a few months of posted books, one month-end check and the bank balance.
// Read-only and windowed so the page never downloads the whole company history.
//
// Two parts so the heavy one never waits: the posted books for the window (journal lines,
// accounts, payroll) start as soon as the client is known; the month-end part (close status,
// checks, bank lines, settlements, bank balance) waits only for the month being closed and the
// linked bank accounts. Both part results are merged into the same shape as before.

export function useHomeFinance(tenantId: string | null | undefined, fromMonth: string, closeMonth: string, bankGlIds: string[] | undefined) {
  const books = useQuery({
    queryKey: ["home-finance", "books", tenantId, fromMonth],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const from = `${fromMonth}-01`;
      const [lineRows, accounts, payroll] = await Promise.all([
        parallelPages<any>((a, b) => sb.from("journal_lines")
          .select("entry_id,account_id,debit,credit,journal_entries!inner(entry_date,status)")
          .eq("tenant_id", tenantId).eq("journal_entries.status", "posted").gte("journal_entries.entry_date", from)
          .order("id", { ascending: true }).range(a, b), { eager: true }),
        parallelPages<BookAccount>((a, b) => sb.from("chart_of_accounts").select("*").eq("tenant_id", tenantId).order("id").range(a, b)),
        parallelPages<any>((a, b) => sb.from("hr_payroll").select("year,month,gross_salary,mpf_employer,accrual_journal_entry_id")
          .eq("tenant_id", tenantId).gte("year", Number(fromMonth.slice(0, 4))).order("id").range(a, b)),
      ]);
      const entryMap = new Map<string, BookEntry>();
      const lines: BookLine[] = [];
      for (const r of lineRows) {
        entryMap.set(r.entry_id, { id: r.entry_id, status: "posted", entry_date: r.journal_entries.entry_date } as BookEntry);
        lines.push({ entry_id: r.entry_id, account_id: r.account_id, debit: r.debit, credit: r.credit } as BookLine);
      }
      return { entries: [...entryMap.values()], lines, accounts, payroll };
    },
  });

  const close = useQuery({
    queryKey: ["home-finance", "close", tenantId, closeMonth, (bankGlIds ?? []).join(",")],
    enabled: !!tenantId && !!bankGlIds,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const [y, m] = closeMonth.split("-").map(Number);
      const closeEnd = new Date(y, m, 0).getDate();
      const [closed, checkRes, bank, batches, cashRows] = await Promise.all([
        sb.from("finance_closed_periods").select("month_start,reopened_at").eq("tenant_id", tenantId).eq("month_start", `${closeMonth}-01`),
        sb.rpc("finance_month_checks", { p_tenant_id: tenantId, p_month: `${closeMonth}-01` }),
        parallelPages<FinanceBank>((a, b) => sb.from("bank_transactions").select("id,txn_date,status,match_confidence,matched_record_id,journal_entry_id")
          .eq("tenant_id", tenantId).gte("txn_date", `${closeMonth}-01`).lte("txn_date", `${closeMonth}-${closeEnd}`).order("id").range(a, b)),
        parallelPages<FinanceBatch>((a, b) => sb.from("payment_settlement_batches").select("id,transaction_date,bank_transaction_id,processor_id,net_settlement")
          .eq("tenant_id", tenantId).gte("transaction_date", `${closeMonth}-01`).lte("transaction_date", `${closeMonth}-${closeEnd}`).order("id").range(a, b)),
        // Bank lines can belong to linked transactions from before the window; still only count posted ones.
        bankGlIds!.length
          ? parallelPages<any>((a, b) => sb.from("journal_lines").select("debit,credit,journal_entries!inner(status)")
            .eq("tenant_id", tenantId).in("account_id", bankGlIds).eq("journal_entries.status", "posted").order("id").range(a, b))
          : Promise.resolve([]),
      ]);
      if (closed.error) throw closed.error;
      if (checkRes.error) throw checkRes.error;
      const cash = cashRows.reduce((n: number, l: any) => n + Number(l.debit) - Number(l.credit), 0);
      return {
        closed: (closed.data ?? []) as any[],
        checks: [checkRes.data as unknown as MonthCheck].filter(Boolean),
        bank, batches, cash,
      };
    },
  });

  const data = books.data && close.data ? { ...books.data, ...close.data } : undefined;
  return {
    data,
    isPending: books.isPending || close.isPending,
    isError: books.isError || close.isError,
    error: books.error ?? close.error,
  };
}
