import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fetchAllRows } from "@/utils/fetchAllRows";

export type ManualRevenueEntry = {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  entry_date: string;
  amount: number;
  description: string;
  revenue_source_id: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  journal_entry_id: string | null;
  status: "draft" | "posted";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CoaLite = { id: string; code: string; name: string; account_type: string; is_cash: boolean };

/**
 * Pick a sensible default revenue account: prefer "Other Income" (account_type =
 * other_income), otherwise the primary revenue account (lowest code among revenue).
 */
function pickRevenueAccount(coa: CoaLite[]): CoaLite | null {
  const otherIncome = coa.find((a) => a.account_type === "other_income");
  if (otherIncome) return otherIncome;
  const revs = coa.filter((a) => a.account_type === "revenue").sort((a, b) => a.code.localeCompare(b.code));
  return revs[0] ?? null;
}

/** Pick a cash/undeposited account: prefer is_cash=true; otherwise first asset account. */
function pickCashAccount(coa: CoaLite[]): CoaLite | null {
  const cash = coa.filter((a) => a.is_cash).sort((a, b) => a.code.localeCompare(b.code));
  if (cash[0]) return cash[0];
  return coa.filter((a) => a.account_type === "asset").sort((a, b) => a.code.localeCompare(b.code))[0] ?? null;
}

export function useManualRevenue() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [entries, setEntries] = useState<ManualRevenueEntry[]>([]);
  const [coa, setCoa] = useState<CoaLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setEntries([]); setCoa([]); setLoading(false); return; }
    setLoading(true);
    const [rowsRaw, coaRaw] = await Promise.all([
      fetchAllRows(
        "manual_revenue_entries",
        "id,tenant_id,venue_id,entry_date,amount,description,revenue_source_id,receipt_url,receipt_path,journal_entry_id,status,created_by,created_at,updated_at",
        { col: "entry_date", asc: false },
        tenantId,
      ),
      fetchAllRows("chart_of_accounts", "id,code,name,account_type,is_cash", { col: "code", asc: true }, tenantId),
    ]);
    setEntries(rowsRaw as ManualRevenueEntry[]);
    setCoa(coaRaw as CoaLite[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  /**
   * Post entry to GL: Dr cash/undeposited, Cr default revenue account.
   * Client-side, mirrors usePettyCash.postReceipt.
   */
  const postEntry = useCallback(async (entry: ManualRevenueEntry) => {
    if (!tenantId) throw new Error("No active tenant");
    if (entry.status === "posted") throw new Error("Already posted");
    const revAcct = pickRevenueAccount(coa);
    const cashAcct = pickCashAccount(coa);
    if (!revAcct) throw new Error("No revenue account found in chart of accounts");
    if (!cashAcct) throw new Error("No cash/asset account found in chart of accounts");

    // Resolve venue label for journal (venue field on journal_entries is text)
    let venueLabel: string | null = null;
    if (entry.venue_id) {
      const { data: v } = await supabase.from("venues").select("name").eq("id", entry.venue_id).maybeSingle();
      venueLabel = (v as any)?.name ?? null;
    }

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      tenant_id: tenantId,
      entry_date: entry.entry_date,
      memo: `Other revenue — ${entry.description || "manual entry"}`,
      source_type: "manual_revenue",
      source_id: entry.id,
      venue: venueLabel,
      status: "posted",
      posted_at: new Date().toISOString(),
    } as any).select("id").single();
    if (jeErr) throw jeErr;

    const amt = Number(entry.amount);
    const { error: linesErr } = await supabase.from("journal_lines").insert([
      { tenant_id: tenantId, entry_id: je.id, account_id: cashAcct.id, debit: amt, credit: 0, line_no: 1, venue: venueLabel, memo: entry.description || "Other revenue" },
      { tenant_id: tenantId, entry_id: je.id, account_id: revAcct.id, debit: 0, credit: amt, line_no: 2, venue: venueLabel, memo: entry.description || "Other revenue" },
    ] as any);
    if (linesErr) throw linesErr;

    const { error: updErr } = await supabase.from("manual_revenue_entries")
      .update({ status: "posted", journal_entry_id: je.id })
      .eq("id", entry.id)
      .eq("tenant_id", tenantId);
    if (updErr) throw updErr;
    await load();
  }, [tenantId, coa, load]);

  return {
    tenantId,
    loading,
    entries,
    coa,
    defaultRevenueAccount: pickRevenueAccount(coa),
    defaultCashAccount: pickCashAccount(coa),
    postEntry,
    reload: load,
  };
}
