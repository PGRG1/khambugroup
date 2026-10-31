import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { claimChecks } from "@/utils/expenses";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type StaffReimbursement = {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  claimant_name: string;
  description: string;
  category_id: string;
  amount: number;
  claim_date: string;
  receipt_url: string | null;
  receipt_path: string | null;
  status: "owing" | "paid";
  approval_status: "pending_review" | "approved";
  receipt_hash?: string | null;
  receipt_shop?: string | null;
  receipt_time?: string | null;
  review_reasons?: string[];
  payout_method?: string | null;
  paid_date: string | null;
  paid_from: "bank" | "petty_cash" | "payroll" | null;
  paid_from_bank_account_id: string | null;
  paid_from_float_id: string | null;
  journal_entry_id: string | null;
  payment_journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReimbClassification = {
  id: string;
  name: string;
  financial_type: "cogs" | "opex" | "asset" | "other";
  gl_account_id: string | null;
  color: string;
  is_active: boolean;
};

export type ReimbFloat = {
  id: string;
  name: string;
  venue: string;
  gl_account_id: string | null;
  is_active: boolean;
};

export type ReimbBankAccount = {
  id: string;
  account_name: string;
  linked_gl_account_id: string | null;
};

export type ReimbCoaAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
};

const PAYABLE_ACCOUNT_NAME = "Staff Reimbursements Payable";

export function useStaffReimbursements() {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [reimbursements, setReimbursements] = useState<StaffReimbursement[]>([]);
  const [classifications, setClassifications] = useState<ReimbClassification[]>([]);
  const [floats, setFloats] = useState<ReimbFloat[]>([]);
  const [bankAccounts, setBankAccounts] = useState<ReimbBankAccount[]>([]);
  const [coa, setCoa] = useState<ReimbCoaAccount[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) {
      setReimbursements([]); setClassifications([]); setFloats([]);
      setBankAccounts([]); setCoa([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [r, c, f, b, ca] = await Promise.all([
      fetchAllRows("staff_reimbursements", "*", { col: "claim_date", asc: false }, tenantId),
      fetchAllRows("petty_cash_classifications", "id, name, financial_type, gl_account_id, color, is_active", { col: "sort_order", asc: true }, tenantId),
      fetchAllRows("petty_cash_floats", "id, name, venue, gl_account_id, is_active", { col: "name", asc: true }, tenantId),
      fetchAllRows("bank_accounts", "id, account_name, linked_gl_account_id", { col: "sort_order", asc: true }, tenantId),
      fetchAllRows("chart_of_accounts", "id, code, name, account_type", { col: "code", asc: true }, tenantId),
    ]);
    setReimbursements(r as StaffReimbursement[]);
    setClassifications(c as ReimbClassification[]);
    setFloats(f as ReimbFloat[]);
    setBankAccounts(b as ReimbBankAccount[]);
    setCoa(ca as ReimbCoaAccount[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const totalOwing = useMemo(
    () => reimbursements.filter(r => r.status === "owing").reduce((s, r) => s + Number(r.amount || 0), 0),
    [reimbursements]
  );

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(); const m = now.getMonth();
    return reimbursements
      .filter(r => r.status === "paid" && r.paid_date)
      .filter(r => {
        const d = new Date(r.paid_date ?? r.claim_date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((s, r) => s + Number(r.amount || 0), 0);
  }, [reimbursements]);

  /**
   * Look up (or create) the shared Staff Reimbursements Payable liability
   * account for the active tenant. Idempotent per-tenant.
   */
  const ensurePayableAccount = useCallback(async (): Promise<ReimbCoaAccount> => {
    if (!tenantId) throw new Error("No active tenant");
    const existing = coa.find(a => a.name === PAYABLE_ACCOUNT_NAME);
    if (existing) return existing;

    // Re-query in case coa cache is stale.
    const { data: hit } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name, account_type")
      .eq("tenant_id", tenantId)
      .eq("name", PAYABLE_ACCOUNT_NAME)
      .maybeSingle();
    if (hit) return hit as ReimbCoaAccount;

    // Pick the first free 21xx code, falling back to 2199.
    const used = new Set(coa.filter(a => /^21\d{2}$/.test(a.code)).map(a => a.code));
    let code = "2150";
    for (let n = 2150; n <= 2199; n++) {
      const c = String(n);
      if (!used.has(c)) { code = c; break; }
    }

    const { data: inserted, error } = await supabase
      .from("chart_of_accounts")
      .insert({
        tenant_id: tenantId,
        code,
        name: PAYABLE_ACCOUNT_NAME,
        account_type: "liability",
        normal_side: "credit",
        is_active: true,
        is_cash: false,
        description: "Amounts owed to staff for out-of-pocket work expenses",
      } as any)
      .select("id, code, name, account_type")
      .single();
    if (error) throw error;
    return inserted as ReimbCoaAccount;
  }, [tenantId, coa]);

  /**
   * Create a claim and post the accrual journal:
   *   Dr category GL account
   *   Cr Staff Reimbursements Payable
   * Tagged with source_type='staff_reimbursement', source_id=claim.id.
   */
  const createClaim = useCallback(async (input: {
    claimant_name: string;
    description: string;
    category_id: string;
    amount: number;
    claim_date: string;
    venue_id?: string | null;
    receipt_url?: string | null;
    receipt_path?: string | null;
    receipt_hash?: string | null;
  receipt_shop?: string | null;
  receipt_time?: string | null;
    review_reasons?: string[];
  }) => {
    if (!tenantId) throw new Error("No active tenant");
    const cls = classifications.find(c => c.id === input.category_id);
    if (!cls?.gl_account_id) throw new Error("Category is missing a GL account mapping");

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;

    const { data: claim, error: insErr } = await supabase
      .from("staff_reimbursements")
      .insert({
        tenant_id: tenantId,
        venue_id: input.venue_id ?? null,
        claimant_name: input.claimant_name.trim(),
        description: input.description.trim(),
        category_id: input.category_id,
        amount: input.amount,
        claim_date: input.claim_date,
        receipt_url: input.receipt_url ?? null,
        receipt_path: input.receipt_path ?? null,
        status: "owing",
        approval_status: "pending_review",
        receipt_hash: input.receipt_hash ?? null,
        receipt_shop: input.receipt_shop ?? null,
        receipt_time: input.receipt_time ?? null,
        review_reasons: [...claimChecks(input,reimbursements,new Date().toISOString().slice(0,10)),...(input.review_reasons??[])],
        created_by: uid,
      } as any)
      .select("*")
      .single();
    if (insErr) throw insErr;

    await load();
    return claim.id as string;
  }, [tenantId, classifications, reimbursements, load]);

  /**
   * Mark a claim paid and post the payment journal:
   *   Dr Staff Reimbursements Payable
   *   Cr bank/petty-cash GL
   * Tagged with source_type='staff_reimbursement_payment'.
   */
  const markAsPaid = useCallback(async (
    claim: StaffReimbursement,
    input: {
      paid_from: "bank" | "petty_cash" | "payroll";
      paid_date: string;
      bank_account_id?: string | null;
      float_id?: string | null;
    }
  ) => {
    if (!tenantId) throw new Error("No active tenant");
    if (claim.approval_status !== "approved") throw new Error("Approve the claim before paying");
    if (claim.status !== "owing") throw new Error("Only claims in 'owing' status can be paid");

    let creditAccountId: string | null = null;
    let creditMemo = "";
    if (input.paid_from === "bank") {
      const b = bankAccounts.find(x => x.id === input.bank_account_id);
      if (!b) throw new Error("Select a bank account");
      if (!b.linked_gl_account_id) throw new Error("Bank account is missing a linked GL account");
      creditAccountId = b.linked_gl_account_id;
      creditMemo = `Paid from ${b.account_name}`;
    } else if (input.paid_from === "petty_cash") {
      const f = floats.find(x => x.id === input.float_id);
      if (!f) throw new Error("Select a petty cash float");
      if (!f.gl_account_id) throw new Error("Petty cash float is missing a GL account");
      creditAccountId = f.gl_account_id;
      creditMemo = `Paid from ${f.name}`;
    } else {
      throw new Error("Payroll payout is not yet supported");
    }

    const payable = await ensurePayableAccount();
    const amt = Number(claim.amount);

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      tenant_id: tenantId,
      entry_date: input.paid_date,
      memo: `Staff reimbursement paid — ${claim.claimant_name}`,
      source_type: "staff_reimbursement_payment",
      source_id: claim.id,
      status: "posted",
      posted_at: new Date().toISOString(),
    } as any).select("id").single();
    if (jeErr) throw jeErr;

    const { error: linesErr } = await supabase.from("journal_lines").insert([
      { tenant_id: tenantId, entry_id: je.id, account_id: payable.id, debit: amt, credit: 0, line_no: 1, memo: `Settling ${claim.claimant_name}` },
      { tenant_id: tenantId, entry_id: je.id, account_id: creditAccountId, debit: 0, credit: amt, line_no: 2, memo: creditMemo },
    ] as any);
    if (linesErr) throw linesErr;

    const { error: updErr } = await supabase.from("staff_reimbursements")
      .update({
        status: "paid",
        paid_date: input.paid_date,
        paid_from: input.paid_from,
        paid_from_bank_account_id: input.paid_from === "bank" ? input.bank_account_id ?? null : null,
        paid_from_float_id: input.paid_from === "petty_cash" ? input.float_id ?? null : null,
        payment_journal_entry_id: je.id,
      })
      .eq("id", claim.id);
    if (updErr) throw updErr;

    await load();
  }, [tenantId, bankAccounts, floats, ensurePayableAccount, load]);

  return {
    tenantId,
    loading,
    reimbursements,
    classifications,
    floats,
    bankAccounts,
    coa,
    totalOwing,
    paidThisMonth,
    reload: load,
    createClaim,
    markAsPaid,
    approveClaim: async (id: string, payout: string) => { const { error } = await supabase.rpc("approve_staff_expense_claim", {p_claim:id,p_payout:payout}); if(error)throw error; await load(); },
  };
}
