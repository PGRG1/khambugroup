import { useEffect, useMemo, useState } from "react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import {
  PeriodGranularity,
  bucketEntries,
  CashflowEntry,
  PeriodBucket,
} from "@/utils/cashflowCalculations";

export interface CashMovement {
  entry_id: string;
  entry_date: string;
  source_type: string;
  memo: string;
  venue: string | null;
  account_code: string;
  account_name: string;
  cash_in: number;
  cash_out: number;
  net_cash: number;
}

interface Options {
  granularity: PeriodGranularity;
  venueFilter: string; // "All Venues" or a venue
  accountFilter: string; // "All Accounts" or account_code
  fromDate?: string;
  toDate?: string;
}

interface Result {
  loading: boolean;
  movements: CashMovement[];
  buckets: Array<PeriodBucket & { runningBalance: number }>;
  totals: { cashIn: number; cashOut: number; net: number; opening: number; closing: number };
  byAccount: Array<{ code: string; name: string; cashIn: number; cashOut: number; net: number }>;
  bySource: Array<{ source: string; cashIn: number; cashOut: number; net: number }>;
  accounts: Array<{ code: string; name: string }>;
  refetch: () => Promise<void>;
}

export function useLedgerCashflow(opts: Options): Result {
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<CashMovement[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows("v_cash_movements", "*");
      // normalize numeric fields
      const norm = (rows as any[]).map((r) => ({
        ...r,
        cash_in: Number(r.cash_in) || 0,
        cash_out: Number(r.cash_out) || 0,
        net_cash: Number(r.net_cash) || 0,
      })) as CashMovement[];
      setAll(norm);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Distinct accounts from full dataset (so the filter dropdown stays stable)
  const accounts = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((r) => m.set(r.account_code, r.account_name));
    return Array.from(m.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [all]);

  // Apply filters
  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (opts.venueFilter !== "All Venues" && (r.venue || "") !== opts.venueFilter) return false;
      if (opts.accountFilter !== "All Accounts" && r.account_code !== opts.accountFilter) return false;
      if (opts.fromDate && r.entry_date < opts.fromDate) return false;
      if (opts.toDate && r.entry_date > opts.toDate) return false;
      return true;
    });
  }, [all, opts.venueFilter, opts.accountFilter, opts.fromDate, opts.toDate]);

  // Opening balance = sum of net_cash for the same venue/account selection BEFORE fromDate
  const opening = useMemo(() => {
    if (!opts.fromDate) return 0;
    return all
      .filter((r) => {
        if (r.entry_date >= opts.fromDate!) return false;
        if (opts.venueFilter !== "All Venues" && (r.venue || "") !== opts.venueFilter) return false;
        if (opts.accountFilter !== "All Accounts" && r.account_code !== opts.accountFilter) return false;
        return true;
      })
      .reduce((s, r) => s + r.net_cash, 0);
  }, [all, opts.fromDate, opts.venueFilter, opts.accountFilter]);

  // Bucketize using existing helper: treat cash_in as inflow, cash_out as outflow
  const inflows: CashflowEntry[] = filtered
    .filter((r) => r.cash_in > 0)
    .map((r) => ({
      date: r.entry_date,
      amount: r.cash_in,
      category: r.source_type === "manual" ? "manual" : (r.source_type as any),
      label: `${r.account_code} ${r.memo || ""}`.trim(),
      venue: r.venue || undefined,
      reference: r.entry_id,
    }));
  const outflows: CashflowEntry[] = filtered
    .filter((r) => r.cash_out > 0)
    .map((r) => ({
      date: r.entry_date,
      amount: r.cash_out,
      category: r.source_type === "manual" ? "manual" : (r.source_type as any),
      label: `${r.account_code} ${r.memo || ""}`.trim(),
      venue: r.venue || undefined,
      reference: r.entry_id,
    }));

  const rawBuckets = bucketEntries(inflows, outflows, opts.granularity);

  // Apply opening + running balance
  let running = opening;
  const buckets = rawBuckets.map((b) => {
    running += b.net;
    return { ...b, runningBalance: running };
  });

  const cashIn = filtered.reduce((s, r) => s + r.cash_in, 0);
  const cashOut = filtered.reduce((s, r) => s + r.cash_out, 0);
  const net = cashIn - cashOut;
  const closing = opening + net;

  // By account
  const byAccount = useMemo(() => {
    const m = new Map<string, { code: string; name: string; cashIn: number; cashOut: number; net: number }>();
    filtered.forEach((r) => {
      if (!m.has(r.account_code))
        m.set(r.account_code, { code: r.account_code, name: r.account_name, cashIn: 0, cashOut: 0, net: 0 });
      const e = m.get(r.account_code)!;
      e.cashIn += r.cash_in;
      e.cashOut += r.cash_out;
      e.net += r.net_cash;
    });
    return Array.from(m.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [filtered]);

  // By source type
  const bySource = useMemo(() => {
    const m = new Map<string, { source: string; cashIn: number; cashOut: number; net: number }>();
    filtered.forEach((r) => {
      const k = r.source_type || "other";
      if (!m.has(k)) m.set(k, { source: k, cashIn: 0, cashOut: 0, net: 0 });
      const e = m.get(k)!;
      e.cashIn += r.cash_in;
      e.cashOut += r.cash_out;
      e.net += r.net_cash;
    });
    return Array.from(m.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [filtered]);

  return {
    loading,
    movements: filtered,
    buckets,
    totals: { cashIn, cashOut, net, opening, closing },
    byAccount,
    bySource,
    accounts,
    refetch: load,
  };
}
