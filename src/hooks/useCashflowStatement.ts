import { useEffect, useMemo, useState } from "react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import {
  classifyCashMovement,
  CashflowSection,
  CounterAccount,
  SECTION_ORDER,
} from "@/utils/cashflowStatementClassifier";

export interface StatementLineDetail {
  entry_id: string;
  entry_date: string;
  memo: string;
  venue: string | null;
  amount: number; // signed: + inflow, - outflow
  account_code: string;
  account_name: string;
  counter_codes: string[];
}

export interface StatementLine {
  section: CashflowSection;
  lineItem: string;
  sortOrder: number;
  amount: number; // signed
  details: StatementLineDetail[];
}

export interface CashflowStatementResult {
  loading: boolean;
  opening: number;
  closing: number;
  netChange: number;
  lines: StatementLine[];
  sectionTotals: Record<CashflowSection, number>;
  unclassified: StatementLineDetail[];
  cashAccounts: Array<{ code: string; name: string; balance: number }>;
}

interface Options {
  fromDate: string;
  toDate: string;
  venueFilter: string; // "All Venues" or specific
}

interface JLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  venue: string | null;
}

interface JEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  venue: string | null;
  status: string;
}

interface Coa {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_cash: boolean;
}

export function useCashflowStatement(opts: Options): CashflowStatementResult {
  const [loading, setLoading] = useState(true);
  const [coa, setCoa] = useState<Coa[]>([]);
  const [entries, setEntries] = useState<JEntry[]>([]);
  const [lines, setLines] = useState<JLine[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [coaRows, entryRows, lineRows] = await Promise.all([
          fetchAllRows("chart_of_accounts", "id,code,name,account_type,is_cash"),
          fetchAllRows("journal_entries", "id,entry_date,memo,venue,status"),
          fetchAllRows("journal_lines", "id,entry_id,account_id,debit,credit,memo,venue"),
        ]);
        setCoa(coaRows as Coa[]);
        setEntries((entryRows as JEntry[]).filter((e) => e.status === "posted"));
        setLines(
          (lineRows as any[]).map((l) => ({
            ...l,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })) as JLine[],
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return useMemo(() => {
    const coaById = new Map<string, Coa>();
    coa.forEach((a) => coaById.set(a.id, a));
    const entryById = new Map<string, JEntry>();
    entries.forEach((e) => entryById.set(e.id, e));

    // Group lines by entry
    const linesByEntry = new Map<string, JLine[]>();
    lines.forEach((l) => {
      if (!linesByEntry.has(l.entry_id)) linesByEntry.set(l.entry_id, []);
      linesByEntry.get(l.entry_id)!.push(l);
    });

    const cashAccountIds = new Set(coa.filter((a) => a.is_cash).map((a) => a.id));

    // Helper: line venue resolution (line.venue ?? entry.venue)
    const lineVenue = (l: JLine, e: JEntry): string | null => l.venue ?? e?.venue ?? null;

    const inRange = (d: string) => d >= opts.fromDate && d <= opts.toDate;
    const beforeRange = (d: string) => d < opts.fromDate;

    const venueMatch = (v: string | null) =>
      opts.venueFilter === "All Venues" || (v || "") === opts.venueFilter;

    // Opening: net cash flow on cash accounts BEFORE fromDate (entry-level venue filter)
    let opening = 0;
    entries.forEach((e) => {
      if (!beforeRange(e.entry_date)) return;
      const ls = linesByEntry.get(e.id) || [];
      ls.forEach((l) => {
        if (!cashAccountIds.has(l.account_id)) return;
        if (!venueMatch(lineVenue(l, e))) return;
        opening += l.debit - l.credit;
      });
    });

    // Build statement lines
    const map = new Map<string, StatementLine>(); // key = section|lineItem
    let netChange = 0;
    const unclassified: StatementLineDetail[] = [];

    entries.forEach((e) => {
      if (!inRange(e.entry_date)) return;
      const ls = linesByEntry.get(e.id) || [];
      const cashLines = ls.filter((l) => cashAccountIds.has(l.account_id));
      if (cashLines.length === 0) return;
      const counterLines = ls.filter((l) => !cashAccountIds.has(l.account_id));
      const counters: CounterAccount[] = counterLines
        .map((l) => coaById.get(l.account_id))
        .filter(Boolean)
        .map((a) => ({ code: a!.code, account_type: a!.account_type }));

      cashLines.forEach((cl) => {
        const v = lineVenue(cl, e);
        if (!venueMatch(v)) return;
        const amount = cl.debit - cl.credit; // signed
        if (amount === 0) return;
        netChange += amount;
        const cls = classifyCashMovement(counters, amount > 0 ? 1 : -1);
        const acct = coaById.get(cl.account_id);
        const detail: StatementLineDetail = {
          entry_id: e.id,
          entry_date: e.entry_date,
          memo: cl.memo || e.memo || "",
          venue: v,
          amount,
          account_code: acct?.code || "",
          account_name: acct?.name || "",
          counter_codes: counters.map((c) => c.code),
        };
        const key = `${cls.section}|${cls.lineItem}`;
        if (!map.has(key)) {
          map.set(key, {
            section: cls.section,
            lineItem: cls.lineItem,
            sortOrder: cls.sortOrder,
            amount: 0,
            details: [],
          });
        }
        const sl = map.get(key)!;
        sl.amount += amount;
        sl.details.push(detail);
        if (counters.length === 0) unclassified.push(detail);
      });
    });

    const allLines = Array.from(map.values()).sort((a, b) => {
      const sa = SECTION_ORDER.indexOf(a.section);
      const sb = SECTION_ORDER.indexOf(b.section);
      if (sa !== sb) return sa - sb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.lineItem.localeCompare(b.lineItem);
    });

    const sectionTotals: Record<CashflowSection, number> = {
      operating: 0,
      investing: 0,
      financing: 0,
    };
    allLines.forEach((l) => {
      sectionTotals[l.section] += l.amount;
    });

    // Cash account closing balances at toDate
    const cashAccounts: Array<{ code: string; name: string; balance: number }> = [];
    coa
      .filter((a) => a.is_cash)
      .forEach((a) => {
        let bal = 0;
        entries.forEach((e) => {
          if (e.entry_date > opts.toDate) return;
          const ls = linesByEntry.get(e.id) || [];
          ls.forEach((l) => {
            if (l.account_id !== a.id) return;
            if (!venueMatch(lineVenue(l, e))) return;
            bal += l.debit - l.credit;
          });
        });
        cashAccounts.push({ code: a.code, name: a.name, balance: bal });
      });

    return {
      loading,
      opening,
      closing: opening + netChange,
      netChange,
      lines: allLines,
      sectionTotals,
      unclassified,
      cashAccounts,
    };
  }, [loading, coa, entries, lines, opts.fromDate, opts.toDate, opts.venueFilter]);
}
