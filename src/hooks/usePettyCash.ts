import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type PettyFloat = {
  id: string;
  tenant_id: string;
  name: string;
  venue: string;
  gl_account_id: string | null;
  float_amount: number;
  replenish_threshold: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export type PettyClassification = {
  id: string;
  tenant_id: string;
  name: string;
  financial_type: "cogs" | "opex" | "asset" | "other";
  gl_account_id: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
};

export type PettyReceipt = {
  id: string;
  tenant_id: string;
  float_id: string;
  receipt_date: string;
  amount: number;
  description: string;
  classification_id: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  status: "pending" | "approved" | "rejected" | "posted";
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PettyReplenishment = {
  id: string;
  tenant_id: string;
  float_id: string;
  replenishment_date: string;
  amount: number;
  from_bank_account_id: string | null;
  reference: string | null;
  notes: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type CoaAccount = { id: string; code: string; name: string; account_type: string };
export type BankAccountLite = { id: string; account_name: string; linked_gl_account_id: string | null };

const SEED_CLASSIFICATIONS: Omit<PettyClassification, "id" | "tenant_id">[] = [
  { name: "Food & Beverage (COGS)", financial_type: "cogs", gl_account_id: null, color: "#c1440e", sort_order: 10, is_active: true },
  { name: "Cleaning & Consumables", financial_type: "opex", gl_account_id: null, color: "#3b7d4f", sort_order: 20, is_active: true },
  { name: "Repairs & Maintenance", financial_type: "opex", gl_account_id: null, color: "#7d5a3b", sort_order: 30, is_active: true },
  { name: "Staff Welfare", financial_type: "opex", gl_account_id: null, color: "#8a5a9c", sort_order: 40, is_active: true },
  { name: "Travel & Transport", financial_type: "opex", gl_account_id: null, color: "#3b6a7d", sort_order: 50, is_active: true },
  { name: "Office Supplies", financial_type: "opex", gl_account_id: null, color: "#7d7d3b", sort_order: 60, is_active: true },
  { name: "Refundable Deposits", financial_type: "asset", gl_account_id: null, color: "#4a4a4a", sort_order: 70, is_active: true },
];

export function usePettyCash() {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [floats, setFloats] = useState<PettyFloat[]>([]);
  const [classifications, setClassifications] = useState<PettyClassification[]>([]);
  const [receipts, setReceipts] = useState<PettyReceipt[]>([]);
  const [replenishments, setReplenishments] = useState<PettyReplenishment[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountLite[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) {
      setFloats([]); setClassifications([]); setReceipts([]); setReplenishments([]);
      setCoa([]); setBankAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [f, c, r, rp, ca, ba] = await Promise.all([
      fetchAllRows("petty_cash_floats", "*", { col: "name", asc: true }, tenantId),
      fetchAllRows("petty_cash_classifications", "*", { col: "sort_order", asc: true }, tenantId),
      fetchAllRows("petty_cash_receipts", "*", { col: "receipt_date", asc: false }, tenantId),
      fetchAllRows("petty_cash_replenishments", "*", { col: "replenishment_date", asc: false }, tenantId),
      fetchAllRows("chart_of_accounts", "id, code, name, account_type", { col: "code", asc: true }),
      fetchAllRows("bank_accounts", "id, account_name, linked_gl_account_id", { col: "sort_order", asc: true }, tenantId),
    ]);
    setFloats(f as PettyFloat[]);
    setClassifications(c as PettyClassification[]);
    setReceipts(r as PettyReceipt[]);
    setReplenishments(rp as PettyReplenishment[]);
    setCoa(ca as CoaAccount[]);
    setBankAccounts(ba as BankAccountLite[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  /** Balance per float = replenishments in − posted-or-approved receipts out. */
  const balanceByFloat = useMemo(() => {
    const byF: Record<string, number> = {};
    for (const f of floats) byF[f.id] = 0;
    for (const rp of replenishments) byF[rp.float_id] = (byF[rp.float_id] ?? 0) + Number(rp.amount || 0);
    for (const r of receipts) {
      if (r.status === "approved" || r.status === "posted") {
        byF[r.float_id] = (byF[r.float_id] ?? 0) - Number(r.amount || 0);
      }
    }
    return byF;
  }, [floats, receipts, replenishments]);

  const seedClassifications = useCallback(async () => {
    if (!tenantId) throw new Error("No active tenant");
    const rows = SEED_CLASSIFICATIONS.map((c) => ({ ...c, tenant_id: tenantId }));
    // Insert with onConflict skip
    const { error } = await supabase
      .from("petty_cash_classifications")
      .upsert(rows as any, { onConflict: "tenant_id,name", ignoreDuplicates: true });
    if (error) throw error;
    await load();
  }, [tenantId, load]);

  /**
   * Post a receipt: create a balanced journal entry
   *  Dr classification.gl_account_id (expense/asset)
   *  Cr float.gl_account_id           (cash)
   * Journal insert MUST include source_id: receipt.id and source_type: 'petty_cash'
   * so Finance can drill back to the source receipt from the GL.
   */
  const postReceipt = useCallback(async (receipt: PettyReceipt) => {
    if (!tenantId) throw new Error("No active tenant");
    const cls = classifications.find((c) => c.id === receipt.classification_id);
    const flt = floats.find((f) => f.id === receipt.float_id);
    if (!cls?.gl_account_id) throw new Error("Classification is missing a GL account");
    if (!flt?.gl_account_id) throw new Error("Float is missing a GL account");

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      tenant_id: tenantId,
      entry_date: receipt.receipt_date,
      memo: `Petty cash — ${receipt.description}`,
      source_type: "petty_cash",
      source_id: receipt.id, // drill-back to receipt
      venue: flt.venue,
      status: "posted",
      posted_at: new Date().toISOString(),
    } as any).select("id").single();
    if (jeErr) throw jeErr;

    const amt = Number(receipt.amount);
    const { error: linesErr } = await supabase.from("journal_lines").insert([
      { tenant_id: tenantId, entry_id: je.id, account_id: cls.gl_account_id, debit: amt, credit: 0, line_no: 1, venue: flt.venue, memo: receipt.description },
      { tenant_id: tenantId, entry_id: je.id, account_id: flt.gl_account_id, debit: 0, credit: amt, line_no: 2, venue: flt.venue, memo: `Petty cash — ${flt.name}` },
    ] as any);
    if (linesErr) throw linesErr;

    const { error: updErr } = await supabase.from("petty_cash_receipts")
      .update({ status: "posted", journal_entry_id: je.id })
      .eq("id", receipt.id);
    if (updErr) throw updErr;
    await load();
  }, [tenantId, classifications, floats, load]);

  /**
   * Post a replenishment: move cash from bank into the float
   *  Dr float.gl_account_id             (cash on hand)
   *  Cr bank_account.linked_gl_account  (bank)
   * Journal insert MUST include source_id: replenishment.id and
   * source_type: 'petty_cash_replenishment'.
   */
  const postReplenishment = useCallback(async (rp: PettyReplenishment) => {
    if (!tenantId) throw new Error("No active tenant");
    const flt = floats.find((f) => f.id === rp.float_id);
    const bank = bankAccounts.find((b) => b.id === rp.from_bank_account_id);
    if (!flt?.gl_account_id) throw new Error("Float is missing a GL account");
    if (!bank?.linked_gl_account_id) throw new Error("Bank account is missing a linked GL account");

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      tenant_id: tenantId,
      entry_date: rp.replenishment_date,
      memo: `Petty cash replenishment — ${flt.name}`,
      source_type: "petty_cash_replenishment",
      source_id: rp.id, // drill-back to replenishment
      venue: flt.venue,
      status: "posted",
      posted_at: new Date().toISOString(),
    } as any).select("id").single();
    if (jeErr) throw jeErr;

    const amt = Number(rp.amount);
    const { error: linesErr } = await supabase.from("journal_lines").insert([
      { tenant_id: tenantId, entry_id: je.id, account_id: flt.gl_account_id, debit: amt, credit: 0, line_no: 1, venue: flt.venue, memo: `Replenishment — ${flt.name}` },
      { tenant_id: tenantId, entry_id: je.id, account_id: bank.linked_gl_account_id, debit: 0, credit: amt, line_no: 2, venue: flt.venue, memo: `From ${bank.account_name}` },
    ] as any);
    if (linesErr) throw linesErr;

    const { error: updErr } = await supabase.from("petty_cash_replenishments")
      .update({ journal_entry_id: je.id })
      .eq("id", rp.id);
    if (updErr) throw updErr;
    await load();
  }, [tenantId, floats, bankAccounts, load]);

  return {
    tenantId,
    loading,
    floats,
    classifications,
    receipts,
    replenishments,
    coa,
    bankAccounts,
    balanceByFloat,
    reload: load,
    seedClassifications,
    postReceipt,
    postReplenishment,
  };
}
