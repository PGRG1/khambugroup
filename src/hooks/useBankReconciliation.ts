import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";

export type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number_last4: string;
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
  import_id: string | null;
  bank_account_id: string;
  txn_date: string;
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

export type CoaAccount = { id: string; code: string; name: string; is_cash: boolean };

export function useBankReconciliation() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTxn[]>([]);
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [ledgerByAccount, setLedgerByAccount] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [a, t, i, c, jl] = await Promise.all([
      fetchAllRows("bank_accounts", "*", { col: "sort_order", asc: true }),
      fetchAllRows("bank_transactions", "*", { col: "txn_date", asc: false }),
      fetchAllRows("bank_statement_imports", "*", { col: "uploaded_at", asc: false }),
      fetchAllRows("chart_of_accounts", "id, code, name, is_cash", { col: "code", asc: true }),
      fetchAllRows("journal_lines", "account_id, debit, credit"),
    ]);
    setAccounts(a as BankAccount[]);
    setTransactions(t as BankTxn[]);
    setImports(i as StatementImport[]);
    setCoa(c as CoaAccount[]);

    // Ledger balance per COA account = sum(debit - credit)
    const ledger: Record<string, number> = {};
    for (const r of jl as Array<{ account_id: string; debit: number; credit: number }>) {
      ledger[r.account_id] = (ledger[r.account_id] || 0) + Number(r.debit || 0) - Number(r.credit || 0);
    }
    setLedgerByAccount(ledger);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const ledgerBalanceFor = (acct: BankAccount): number => {
    if (!acct.linked_gl_account_id) return Number(acct.opening_balance || 0);
    return Number(acct.opening_balance || 0) + (ledgerByAccount[acct.linked_gl_account_id] || 0);
  };

  const statementBalanceFor = (acctId: string): number => {
    const latest = imports
      .filter((i) => i.bank_account_id === acctId)
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
    if (latest) return Number(latest.closing_balance || 0);
    // fallback: opening + sum of txns
    const acct = accounts.find((x) => x.id === acctId);
    const txnSum = transactions
      .filter((t) => t.bank_account_id === acctId)
      .reduce((s, t) => s + Number(t.money_in || 0) - Number(t.money_out || 0), 0);
    return Number(acct?.opening_balance || 0) + txnSum;
  };

  return {
    loading,
    accounts,
    transactions,
    imports,
    coa,
    ledgerBalanceFor,
    statementBalanceFor,
    reload: load,
    supabase,
  };
}
