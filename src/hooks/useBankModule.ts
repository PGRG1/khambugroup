import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { classifyTxn, type UserRule } from "@/utils/bankTxnRules";

export type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number_last4: string;
  account_type?: string;
  currency: string;
  venue: string | null;
  entity: string | null;
  linked_gl_account_id: string | null;
  opening_balance: number;
  opening_date: string;
  is_active: boolean;
  last_reconciled_date: string | null;
  notes: string;
  sort_order: number;
};

export type BankTxn = {
  id: string;
  tenant_id: string | null;
  import_id: string | null;
  bank_account_id: string;
  txn_date: string;
  value_date: string | null;
  description: string;
  reference: string;
  money_in: number;
  money_out: number;
  running_balance: number | null;
  status: string;
  match_confidence: string | null;
  matched_record_type: string | null;
  matched_record_id: string | null;
  notes: string;
  currency: string | null;
  category_account_id: string | null;
  attachment_urls: string[] | null;
  parent_txn_id: string | null;
  is_transfer: boolean | null;
  transfer_pair_id: string | null;
  fx_rate: number | null;
  fx_gain_loss: number | null;
  is_manual: boolean | null;
  suggested_category: string | null;
  journal_entry_id: string | null;
};

export type StatementImport = {
  id: string;
  bank_account_id: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  file_url: string | null;
  file_name: string | null;
  uploaded_at: string;
  status: string;
};

export type FxRate = {
  id: string;
  tenant_id: string;
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string | null;
  notes: string | null;
};

export type CoaAccount = { id: string; code: string; name: string; is_cash: boolean };

export function useBankModule() {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTxn[]>([]);
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [reconRules, setReconRules] = useState<UserRule[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [ledgerByAccount, setLedgerByAccount] = useState<Record<string, number>>({});
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) {
      setAccounts([]); setTransactions([]); setImports([]); setCoa([]);
      setRules([]); setReconRules([]); setFxRates([]); setMatches([]);
      setLedgerByAccount({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const [a, t, i, c, jl, r, fx, mt] = await Promise.all([
      fetchAllRows("bank_accounts", "*", { col: "sort_order", asc: true }, tenantId),
      fetchAllRows("bank_transactions", "*", { col: "txn_date", asc: false }, tenantId),
      fetchAllRows("bank_statement_imports", "*", { col: "uploaded_at", asc: false }, tenantId),
      fetchAllRows("chart_of_accounts", "id, code, name, is_cash", { col: "code", asc: true }),
      fetchAllRows("journal_lines", "account_id, debit, credit"),
      fetchAllRows("bank_recon_rules", "*", { col: "sort_order", asc: true }, tenantId),
      fetchAllRows("bank_fx_rates", "*", { col: "rate_date", asc: false }, tenantId),
      fetchAllRows("bank_transaction_matches", "*", undefined, tenantId),
    ]);
    setAccounts(a as BankAccount[]);
    setTransactions(t as BankTxn[]);
    setImports(i as StatementImport[]);
    setCoa(c as CoaAccount[]);
    setRules(r);
    setReconRules(
      (r as any[]).map((x) => ({
        id: x.id,
        name: x.name || x.match_contains || "rule",
        match_contains: x.match_contains || "",
        suggested_type: x.suggested_type || "",
        suggested_category: x.suggested_category || null,
        is_active: x.is_active !== false,
        sort_order: x.sort_order ?? 0,
      })),
    );
    setFxRates(fx as FxRate[]);
    setMatches(mt);

    const ledger: Record<string, number> = {};
    for (const row of jl as Array<{ account_id: string; debit: number; credit: number }>) {
      ledger[row.account_id] = (ledger[row.account_id] || 0) + Number(row.debit || 0) - Number(row.credit || 0);
    }
    setLedgerByAccount(ledger);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const ledgerBalanceFor = (acct: BankAccount): number => {
    if (!acct.linked_gl_account_id) return Number(acct.opening_balance || 0);
    return Number(acct.opening_balance || 0) + (ledgerByAccount[acct.linked_gl_account_id] || 0);
  };

  const statementBalanceFor = (acctId: string): number => {
    const latest = imports
      .filter((i) => i.bank_account_id === acctId)
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
    if (latest) return Number(latest.closing_balance || 0);
    const acct = accounts.find((x) => x.id === acctId);
    const txnSum = transactions
      .filter((t) => t.bank_account_id === acctId)
      .reduce((s, t) => s + Number(t.money_in || 0) - Number(t.money_out || 0), 0);
    return Number(acct?.opening_balance || 0) + txnSum;
  };

  const currentBalanceFor = (acctId: string): number => {
    const acct = accounts.find((x) => x.id === acctId);
    if (!acct) return 0;
    const txnSum = transactions
      .filter((t) => t.bank_account_id === acctId)
      .reduce((s, t) => s + Number(t.money_in || 0) - Number(t.money_out || 0), 0);
    return Number(acct.opening_balance || 0) + txnSum;
  };

  // Filtered views
  const incoming = useMemo(() => transactions.filter((t) => Number(t.money_in) > 0), [transactions]);
  const outgoing = useMemo(() => transactions.filter((t) => Number(t.money_out) > 0), [transactions]);
  const transfers = useMemo(() => transactions.filter((t) => !!t.is_transfer), [transactions]);
  const unmatched = useMemo(
    () =>
      transactions.filter(
        (t) =>
          !t.matched_record_id &&
          (t.status === "unmatched" || t.status === "pending" || t.status === "imported" || !t.status),
      ),
    [transactions],
  );
  const lowConfidence = useMemo(
    () => transactions.filter((t) => t.match_confidence === "low"),
    [transactions],
  );
  const feesAndCharges = useMemo(() => {
    return transactions.filter((t) => {
      const c = classifyTxn(t.description, Number(t.money_in) || 0, Number(t.money_out) || 0, reconRules);
      return c && (c.suggested_type === "bank_fee" || c.suggested_type === "kpay_settlement" || c.suggested_type === "interest_income" || t.matched_record_type === "bank_fee");
    });
  }, [transactions, reconRules]);

  const byCurrency = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of accounts) {
      const bal = currentBalanceFor(a.id);
      const ccy = a.currency || "HKD";
      out[ccy] = (out[ccy] || 0) + bal;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, transactions]);

  // Mutations
  const updateTxn = async (id: string, patch: Partial<BankTxn>) => {
    const { error } = await supabase.from("bank_transactions").update(patch as any).eq("id", id);
    if (error) throw error;
    await load();
  };

  const createManualTxn = async (txn: Partial<BankTxn>) => {
    const { error } = await supabase.from("bank_transactions").insert({
      ...(txn as any),
      tenant_id: tenantId,
      is_manual: true,
      status: txn.status || "imported",
    });
    if (error) throw error;
    await load();
  };

  const splitTxn = async (id: string, splits: Array<{ description: string; money_in: number; money_out: number; category_account_id?: string | null }>) => {
    const parent = transactions.find((t) => t.id === id);
    if (!parent) return;
    const rows = splits.map((s) => ({
      bank_account_id: parent.bank_account_id,
      txn_date: parent.txn_date,
      description: s.description,
      reference: parent.reference,
      money_in: s.money_in || 0,
      money_out: s.money_out || 0,
      tenant_id: parent.tenant_id ?? tenantId,
      parent_txn_id: id,
      currency: parent.currency,
      category_account_id: s.category_account_id ?? null,
      status: "classified",
      is_manual: true,
    }));
    const { error } = await supabase.from("bank_transactions").insert(rows as any);
    if (error) throw error;
    await supabase.from("bank_transactions").update({ status: "split" }).eq("id", id);
    await load();
  };

  const createMatch = async (txnId: string, matchedType: string, matchedId: string, amount: number, confidence = "high", notes?: string) => {
    const { error } = await supabase.from("bank_transaction_matches").insert({
      tenant_id: tenantId,
      txn_id: txnId,
      matched_type: matchedType,
      matched_id: matchedId,
      amount,
      confidence,
      notes,
    });
    if (error) throw error;
    await supabase
      .from("bank_transactions")
      .update({ matched_record_type: matchedType, matched_record_id: matchedId, match_confidence: confidence, status: "matched" })
      .eq("id", txnId);
    await load();
  };

  const deleteMatch = async (matchId: string) => {
    await supabase.from("bank_transaction_matches").delete().eq("id", matchId);
    await load();
  };

  const createTransfer = async (fromId: string, toId: string, amount: number, date: string, fxRate?: number, note?: string) => {
    const pairId = crypto.randomUUID();
    const rows = [
      {
        bank_account_id: fromId,
        txn_date: date,
        description: note || "Internal transfer (out)",
        money_in: 0,
        money_out: amount,
        tenant_id: tenantId,
        is_transfer: true,
        transfer_pair_id: pairId,
        status: "matched",
        is_manual: true,
        fx_rate: fxRate ?? null,
      },
      {
        bank_account_id: toId,
        txn_date: date,
        description: note || "Internal transfer (in)",
        money_in: fxRate ? Number((amount * fxRate).toFixed(2)) : amount,
        money_out: 0,
        tenant_id: tenantId,
        is_transfer: true,
        transfer_pair_id: pairId,
        status: "matched",
        is_manual: true,
        fx_rate: fxRate ?? null,
      },
    ];
    const { error } = await supabase.from("bank_transactions").insert(rows as any);
    if (error) throw error;
    await load();
  };

  const saveAccount = async (acct: Partial<BankAccount>) => {
    if (acct.id) {
      const { error } = await supabase.from("bank_accounts").update(acct as any).eq("id", acct.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("bank_accounts").insert({ ...(acct as any), tenant_id: tenantId });
      if (error) throw error;
    }
    await load();
  };

  const saveRule = async (rule: any) => {
    if (rule.id) {
      const { error } = await supabase.from("bank_recon_rules").update(rule).eq("id", rule.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("bank_recon_rules").insert({ ...rule, tenant_id: tenantId });
      if (error) throw error;
    }
    await load();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("bank_recon_rules").delete().eq("id", id);
    await load();
  };

  const saveFxRate = async (fx: Partial<FxRate>) => {
    if (fx.id) {
      const { error } = await supabase.from("bank_fx_rates").update(fx as any).eq("id", fx.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("bank_fx_rates").insert({ ...(fx as any), tenant_id: tenantId });
      if (error) throw error;
    }
    await load();
  };

  return {
    loading,
    tenantId,
    accounts,
    transactions,
    imports,
    rules,
    reconRules,
    matches,
    coa,
    fxRates,
    ledgerBalanceFor,
    statementBalanceFor,
    currentBalanceFor,
    incoming,
    outgoing,
    transfers,
    unmatched,
    lowConfidence,
    feesAndCharges,
    byCurrency,
    classify: (t: BankTxn) => classifyTxn(t.description, Number(t.money_in) || 0, Number(t.money_out) || 0, reconRules),
    reload: load,
    updateTxn,
    createManualTxn,
    splitTxn,
    createMatch,
    deleteMatch,
    createTransfer,
    saveAccount,
    saveRule,
    deleteRule,
    saveFxRate,
  };
}
