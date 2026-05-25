import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { bucketOf } from "./useReceivables";

export type APInvoice = {
  id: string;
  invoice_date: string;
  due_date: string | null;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  venue: string;
  total_amount: number;
  amount_paid: number;
  outstanding_amount: number;
  age_days: number;
  bucket: string;
  payment_status: string; // derived (incl. overdue)
  raw_payment_status: string;
  bank_match_status: string;
  scheduled_payment_date: string | null;
  exception_note: string | null;
  last_payment_method: string | null;
  last_paid_from_account_id: string | null;
  last_paid_from_account_name: string | null;
  file_url: string | null;
};

export type APSupplierSummary = {
  supplier_id: string;
  supplier_name: string;
  outstanding: number;
  open_count: number;
  oldest_age: number;
  last_invoice_date: string | null;
};
export type APPayrollPayable = {
  account_code: string;
  account_name: string;
  outstanding: number;
};
export type APBankAccountLite = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number_last4: string;
};

export type APCreditNote = {
  id: string;
  supplier_id: string;
  credit_note_number: string;
  credit_note_date: string;
  original_amount: number;
  remaining_balance: number;
  status: string;
  notes: string;
};

export type APKpis = {
  totalOutstanding: number;
  dueThisWeek: number;
  overdue: number;
  paidThisMonth: number;
  partiallyPaid: number;
  awaitingBankMatch: number;
  unallocatedPayments: number;
};

export function usePayables() {
  const [invoices, setInvoices] = useState<APInvoice[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<APSupplierSummary[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [awaitingBankMatchCount, setAwaitingBankMatchCount] = useState(0);
  const [unallocatedPaymentsCount, setUnallocatedPaymentsCount] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<APBankAccountLite[]>([]);
  const [payrollPayables, setPayrollPayables] = useState<APPayrollPayable[]>([]);
  const [creditNotes, setCreditNotes] = useState<APCreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      // Approved invoices only
      const rawInvoices = await fetchAllRows(
        "invoices",
        "id, invoice_date, due_date, invoice_number, supplier_id, venue, total_amount, amount_paid, remaining_balance, payment_status, payment_method, status, review_status, bank_match_status, scheduled_payment_date, exception_note, file_url, suppliers(name)"
      );
      const approved = (rawInvoices || []).filter(
        (i: any) => i.review_status === "Approved"
      );

      // Bank accounts
      const banks = await fetchAllRows(
        "bank_accounts",
        "id, account_name, bank_name, account_number_last4, is_active"
      );
      const activeBanks = (banks || []).filter((b: any) => b.is_active !== false);
      setBankAccounts(activeBanks.map((b: any) => ({
        id: b.id,
        account_name: b.account_name || "",
        bank_name: b.bank_name || "",
        account_number_last4: b.account_number_last4 || "",
      })));
      const bankMap = new Map(activeBanks.map((b: any) => [b.id, b]));

      // All payments (to derive last payment + paid-this-month + awaiting count)
      const payments = await fetchAllRows(
        "invoice_payments",
        "id, invoice_id, payment_date, amount, payment_method, bank_account_id, bank_transaction_id, match_status"
      );
      const paymentsByInvoice = new Map<string, any[]>();
      for (const p of payments as any[]) {
        const arr = paymentsByInvoice.get(p.invoice_id) || [];
        arr.push(p);
        paymentsByInvoice.set(p.invoice_id, arr);
      }

      setPaidThisMonth(
        (payments as any[])
          .filter((p) => p.payment_date && p.payment_date >= monthStart)
          .reduce((s, p) => s + (Number(p.amount) || 0), 0)
      );
      setAwaitingBankMatchCount(
        (payments as any[]).filter((p) =>
          ["awaiting_bank_match", "possible_match", "needs_review"].includes(
            p.match_status || "awaiting_bank_match"
          )
        ).length
      );
      setUnallocatedPaymentsCount(
        (payments as any[]).filter((p) => !p.invoice_id).length
      );

      const list: APInvoice[] = approved.map((i: any) => {
        const ageDays = Math.floor(
          (today.getTime() - new Date(i.invoice_date).getTime()) / 86400000
        );
        const total = Number(i.total_amount) || 0;
        const paid = Number(i.amount_paid) || 0;
        const remaining = i.remaining_balance != null ? Number(i.remaining_balance) : Math.max(0, total - paid);
        const raw = (i.payment_status || "unpaid") as string;
        // Derive overdue
        let derived = raw;
        if (raw === "unpaid" && i.due_date && i.due_date < todayStr) derived = "overdue";

        const invPayments = (paymentsByInvoice.get(i.id) || []).sort((a, b) =>
          (b.payment_date || "").localeCompare(a.payment_date || "")
        );
        const lastPay = invPayments[0];
        const lastBank = lastPay?.bank_account_id ? bankMap.get(lastPay.bank_account_id) : null;

        return {
          id: i.id,
          invoice_date: i.invoice_date,
          due_date: i.due_date,
          invoice_number: i.invoice_number || "",
          supplier_id: i.supplier_id,
          supplier_name: i.suppliers?.name || "(no supplier)",
          venue: i.venue,
          total_amount: total,
          amount_paid: paid,
          outstanding_amount: Math.round(remaining * 100) / 100,
          age_days: ageDays,
          bucket: bucketOf(ageDays),
          payment_status: derived,
          raw_payment_status: raw,
          bank_match_status: i.bank_match_status || "not_ready",
          scheduled_payment_date: i.scheduled_payment_date || null,
          exception_note: i.exception_note && i.exception_note !== "-" ? i.exception_note : null,
          last_payment_method: lastPay?.payment_method || i.payment_method || null,
          last_paid_from_account_id: lastPay?.bank_account_id || null,
          last_paid_from_account_name: lastBank
            ? `${lastBank.bank_name} ${lastBank.account_number_last4 ? "•••" + lastBank.account_number_last4 : ""}`.trim()
            : null,
          file_url: i.file_url || null,
        };
      });
      list.sort((a, b) => b.age_days - a.age_days);
      setInvoices(list);

      // Supplier summary (open only)
      const supMap = new Map<string, APSupplierSummary>();
      const allBySupplier = new Map<string, any[]>();
      for (const i of approved) {
        const arr = allBySupplier.get(i.supplier_id) || [];
        arr.push(i);
        allBySupplier.set(i.supplier_id, arr);
      }
      for (const inv of list.filter((x) => x.outstanding_amount > 0 && x.payment_status !== "voided")) {
        const cur = supMap.get(inv.supplier_id) || {
          supplier_id: inv.supplier_id,
          supplier_name: inv.supplier_name,
          outstanding: 0,
          open_count: 0,
          oldest_age: 0,
          last_invoice_date: null,
        };
        cur.outstanding += inv.outstanding_amount;
        cur.open_count += 1;
        cur.oldest_age = Math.max(cur.oldest_age, inv.age_days);
        supMap.set(inv.supplier_id, cur);
      }
      for (const [sid, sum] of supMap) {
        const all = allBySupplier.get(sid) || [];
        const last = all.map((x: any) => x.invoice_date).sort().pop();
        sum.last_invoice_date = last || null;
        sum.outstanding = Math.round(sum.outstanding * 100) / 100;
      }
      setSupplierSummary(
        Array.from(supMap.values()).sort((a, b) => b.outstanding - a.outstanding)
      );

      // Payroll-related payables
      const { data: payrollAccts } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name")
        .in("code", ["2030", "2040"]);
      if (payrollAccts && payrollAccts.length > 0) {
        const acctIds = payrollAccts.map((a: any) => a.id);
        const allLines = await fetchAllRows("journal_lines", "account_id, debit, credit");
        const balByAcct = new Map<string, number>();
        for (const l of allLines as any[]) {
          if (!acctIds.includes(l.account_id)) continue;
          const cur = balByAcct.get(l.account_id) ?? 0;
          balByAcct.set(l.account_id, cur + (Number(l.credit) || 0) - (Number(l.debit) || 0));
        }
        setPayrollPayables(
          payrollAccts
            .map((a: any) => ({
              account_code: a.code,
              account_name: a.name,
              outstanding: Math.round((balByAcct.get(a.id) ?? 0) * 100) / 100,
            }))
            .filter((p) => Math.abs(p.outstanding) > 0.01)
        );
      } else {
        setPayrollPayables([]);
      }

      // Approved credit notes with remaining balance
      const cns = await fetchAllRows(
        "credit_notes",
        "id, supplier_id, credit_note_number, credit_note_date, original_amount, remaining_balance, status, notes"
      );
      setCreditNotes(
        (cns || [])
          .filter((c: any) => c.status === "approved" && Number(c.remaining_balance) > 0.01)
          .map((c: any) => ({
            id: c.id,
            supplier_id: c.supplier_id,
            credit_note_number: c.credit_note_number || "",
            credit_note_date: c.credit_note_date,
            original_amount: Number(c.original_amount) || 0,
            remaining_balance: Number(c.remaining_balance) || 0,
            status: c.status,
            notes: c.notes || "",
          }))
      );

      setLoading(false);
    })();
  }, [refreshKey]);

  return {
    invoices,
    supplierSummary,
    paidThisMonth,
    awaitingBankMatchCount,
    unallocatedPaymentsCount,
    bankAccounts,
    payrollPayables,
    creditNotes,
    loading,
    refresh,
  };
}

