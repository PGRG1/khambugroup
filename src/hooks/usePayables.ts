import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
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
  supplier_name: string;
  credit_note_number: string;
  credit_note_date: string;
  original_amount: number;
  applied_amount: number;
  remaining_balance: number;
  status: string; // approved | fully_applied | draft | voided | needs_review
  venue: string | null;
  notes: string;
  source_invoice_id: string | null;
  source_invoice_number: string | null;
};

export type APPaymentRow = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  paid_from_account_id: string | null;
  paid_from_account_name: string | null;
  reference_number: string;
  cheque_number: string;
  notes: string;
  supplier_id: string | null;
  supplier_name: string;
  match_status: string;
  allocated_amount: number;
  credit_applied: number;
  unallocated_amount: number;
  allocation_count: number;
  invoice_numbers: string[];
};

export function usePayables() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [invoices, setInvoices] = useState<APInvoice[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<APSupplierSummary[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [awaitingBankMatchCount, setAwaitingBankMatchCount] = useState(0);
  const [unallocatedPaymentsCount, setUnallocatedPaymentsCount] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<APBankAccountLite[]>([]);
  const [payrollPayables, setPayrollPayables] = useState<APPayrollPayable[]>([]);
  const [creditNotes, setCreditNotes] = useState<APCreditNote[]>([]);
  const [creditNotesAvailable, setCreditNotesAvailable] = useState<APCreditNote[]>([]);
  const [appliedCreditThisMonth, setAppliedCreditThisMonth] = useState(0);
  const [payments, setPayments] = useState<APPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) {
      setInvoices([]); setSupplierSummary([]); setPayments([]); setPayrollPayables([]);
      setCreditNotes([]); setCreditNotesAvailable([]); setBankAccounts([]); setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      // Suppliers map (for credit notes & payments)
      const suppliersRaw = await fetchAllRows("suppliers", "id, name", undefined, tenantId);
      const supplierName = new Map<string, string>(
        (suppliersRaw as any[]).map((s) => [s.id, s.name || "(no supplier)"])
      );

      // Approved invoices only
      const rawInvoices = await fetchAllRows(
        "invoices",
        "id, invoice_date, due_date, invoice_number, supplier_id, venue, total_amount, amount_paid, remaining_balance, payment_status, payment_method, status, review_status, bank_match_status, scheduled_payment_date, exception_note, file_url, suppliers(name)",
        undefined,
        tenantId,
      );
      const approved = (rawInvoices || []).filter(
        (i: any) => i.review_status === "Approved"
      );
      const invoiceNumberById = new Map<string, string>(
        (rawInvoices as any[]).map((i) => [i.id, i.invoice_number || ""])
      );

      // Bank accounts
      const banks = await fetchAllRows(
        "bank_accounts",
        "id, account_name, bank_name, account_number_last4, is_active",
        undefined,
        tenantId,
      );
      const activeBanks = (banks || []).filter((b: any) => b.is_active !== false);
      setBankAccounts(activeBanks.map((b: any) => ({
        id: b.id,
        account_name: b.account_name || "",
        bank_name: b.bank_name || "",
        account_number_last4: b.account_number_last4 || "",
      })));
      const bankMap = new Map(activeBanks.map((b: any) => [b.id, b]));
      const bankLabel = (id: string | null) => {
        if (!id) return null;
        const b: any = bankMap.get(id);
        if (!b) return null;
        return `${b.bank_name || b.account_name}${b.account_number_last4 ? " •••" + b.account_number_last4 : ""}`.trim();
      };

      // Legacy invoice_payments (for back-compat last-payment derivation on invoices)
      const legacyPayments = await fetchAllRows(
        "invoice_payments",
        "id, invoice_id, payment_date, amount, payment_method, bank_account_id, match_status",
        undefined,
        tenantId,
      );
      const paymentsByInvoice = new Map<string, any[]>();
      for (const p of legacyPayments as any[]) {
        const arr = paymentsByInvoice.get(p.invoice_id) || [];
        arr.push(p);
        paymentsByInvoice.set(p.invoice_id, arr);
      }

      // NEW: payments + allocations
      const paymentRows = await fetchAllRows(
        "payments",
        "id, payment_date, amount, payment_method, paid_from_account_id, reference_number, cheque_number, notes, supplier_id, match_status",
        undefined,
        tenantId,
      );
      const allocRows = await fetchAllRows(
        "payment_allocations",
        "id, payment_id, invoice_id, amount_allocated, credit_note_id, credit_note_amount_applied",
        undefined,
        tenantId,
      );
      const allocByPayment = new Map<string, any[]>();
      for (const a of allocRows as any[]) {
        const arr = allocByPayment.get(a.payment_id) || [];
        arr.push(a);
        allocByPayment.set(a.payment_id, arr);
      }

      const paymentsMapped: APPaymentRow[] = (paymentRows as any[]).map((p) => {
        const allocs = allocByPayment.get(p.id) || [];
        const allocated = allocs.reduce((s, a) => s + (Number(a.amount_allocated) || 0), 0);
        const credit = allocs.reduce((s, a) => s + (Number(a.credit_note_amount_applied) || 0), 0);
        const amount = Number(p.amount) || 0;
        const invNums = Array.from(
          new Set(
            allocs
              .map((a) => invoiceNumberById.get(a.invoice_id) || "")
              .filter(Boolean)
          )
        );
        return {
          id: p.id,
          payment_date: p.payment_date,
          amount,
          payment_method: p.payment_method || "",
          paid_from_account_id: p.paid_from_account_id || null,
          paid_from_account_name: bankLabel(p.paid_from_account_id),
          reference_number: p.reference_number || "",
          cheque_number: p.cheque_number || "",
          notes: p.notes || "",
          supplier_id: p.supplier_id || null,
          supplier_name: p.supplier_id ? (supplierName.get(p.supplier_id) || "—") : "—",
          match_status: p.match_status || "awaiting_bank_match",
          allocated_amount: Math.round(allocated * 100) / 100,
          credit_applied: Math.round(credit * 100) / 100,
          unallocated_amount: Math.round(Math.max(0, amount - allocated) * 100) / 100,
          allocation_count: allocs.length,
          invoice_numbers: invNums,
        };
      });
      paymentsMapped.sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""));
      setPayments(paymentsMapped);

      // KPIs derived from new payments where possible, fallback to legacy
      const newPaidThisMonth = paymentsMapped
        .filter((p) => p.payment_date && p.payment_date >= monthStart)
        .reduce((s, p) => s + p.amount, 0);
      const legacyPaidThisMonth = (legacyPayments as any[])
        .filter((p) => p.payment_date && p.payment_date >= monthStart)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      setPaidThisMonth(newPaidThisMonth || legacyPaidThisMonth);

      setAwaitingBankMatchCount(
        paymentsMapped.filter((p) =>
          ["awaiting_bank_match", "possible_match", "needs_review"].includes(p.match_status)
        ).length
      );
      setUnallocatedPaymentsCount(
        paymentsMapped.filter((p) => p.unallocated_amount > 0.01).length
      );

      const list: APInvoice[] = approved.map((i: any) => {
        const ageDays = Math.floor(
          (today.getTime() - new Date(i.invoice_date).getTime()) / 86400000
        );
        const total = Number(i.total_amount) || 0;
        const paid = Number(i.amount_paid) || 0;
        // Always compute from total - paid; the stored remaining_balance column can be stale.
        const computed = Math.max(0, total - paid);
        const stored = i.remaining_balance != null ? Number(i.remaining_balance) : null;
        const remaining = stored != null && stored > 0 ? stored : computed;
        const raw = (i.payment_status || "unpaid") as string;
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
          supplier_name: i.suppliers?.name || supplierName.get(i.supplier_id) || "(no supplier)",
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
            ? `${(lastBank as any).bank_name} ${(lastBank as any).account_number_last4 ? "•••" + (lastBank as any).account_number_last4 : ""}`.trim()
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
        .eq("tenant_id", tenantId)
        .in("code", ["2030", "2040"]);
      if (payrollAccts && payrollAccts.length > 0) {
        const acctIds = payrollAccts.map((a: any) => a.id);
        const allLines = await fetchAllRows("journal_lines", "account_id, debit, credit", undefined, tenantId);
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

      // Credit notes (all)
      const cns = await fetchAllRows(
        "credit_notes",
        "id, supplier_id, credit_note_number, credit_note_date, original_amount, remaining_balance, status, venue, notes, source_invoice_id",
        undefined,
        tenantId,
      );
      const mappedCNs: APCreditNote[] = (cns || []).map((c: any) => {
        const orig = Number(c.original_amount) || 0;
        const rem = Number(c.remaining_balance) || 0;
        return {
          id: c.id,
          supplier_id: c.supplier_id,
          supplier_name: supplierName.get(c.supplier_id) || "—",
          credit_note_number: c.credit_note_number || "",
          credit_note_date: c.credit_note_date,
          original_amount: orig,
          applied_amount: Math.max(0, Math.round((orig - rem) * 100) / 100),
          remaining_balance: rem,
          status: c.status || "approved",
          venue: c.venue || null,
          notes: c.notes || "",
          source_invoice_id: c.source_invoice_id || null,
          source_invoice_number: c.source_invoice_id ? (invoiceNumberById.get(c.source_invoice_id) || null) : null,
        };
      });
      setCreditNotes(mappedCNs);
      setCreditNotesAvailable(
        mappedCNs.filter((c) => c.status === "approved" && c.remaining_balance > 0.01)
      );

      // Applied credit this month from allocations joined with payments
      const paymentDateById = new Map<string, string>(
        (paymentRows as any[]).map((p) => [p.id, p.payment_date])
      );
      const appliedCN = (allocRows as any[]).reduce((s, a) => {
        const pd = paymentDateById.get(a.payment_id);
        if (pd && pd >= monthStart && Number(a.credit_note_amount_applied) > 0) {
          return s + Number(a.credit_note_amount_applied);
        }
        return s;
      }, 0);
      setAppliedCreditThisMonth(Math.round(appliedCN * 100) / 100);

      setLoading(false);
    })();
  }, [refreshKey, tenantId, tenantLoading]);

  return {
    invoices,
    supplierSummary,
    paidThisMonth,
    awaitingBankMatchCount,
    unallocatedPaymentsCount,
    bankAccounts,
    payrollPayables,
    creditNotes,
    creditNotesAvailable,
    appliedCreditThisMonth,
    payments,
    loading,
    refresh,
  };
}
