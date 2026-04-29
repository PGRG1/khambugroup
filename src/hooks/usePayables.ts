import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { bucketOf } from "./useReceivables";

export type APOpenInvoice = {
  id: string;
  invoice_date: string;
  due_date: string | null;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  venue: string;
  total_amount: number;
  age_days: number;
  bucket: string;
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

export function usePayables() {
  const [openInvoices, setOpenInvoices] = useState<APOpenInvoice[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<APSupplierSummary[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [payrollPayables, setPayrollPayables] = useState<APPayrollPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      const invoices = await fetchAllRows(
        "invoices",
        "id, invoice_date, due_date, invoice_number, supplier_id, venue, total_amount, status, suppliers(name)"
      );
      const open = (invoices || [])
        .filter((i: any) => i.status === "unpaid")
        .map((i: any) => {
          const ageDays = Math.floor(
            (today.getTime() - new Date(i.invoice_date).getTime()) / 86400000
          );
          return {
            id: i.id,
            invoice_date: i.invoice_date,
            due_date: i.due_date,
            invoice_number: i.invoice_number || "",
            supplier_id: i.supplier_id,
            supplier_name: i.suppliers?.name || "(no supplier)",
            venue: i.venue,
            total_amount: Number(i.total_amount) || 0,
            age_days: ageDays,
            bucket: bucketOf(ageDays),
          } as APOpenInvoice;
        });
      open.sort((a, b) => b.age_days - a.age_days);
      setOpenInvoices(open);

      // Supplier summary
      const supMap = new Map<string, APSupplierSummary>();
      const allBySupplier = new Map<string, any[]>();
      for (const i of invoices || []) {
        const arr = allBySupplier.get(i.supplier_id) || [];
        arr.push(i);
        allBySupplier.set(i.supplier_id, arr);
      }
      for (const inv of open) {
        const cur = supMap.get(inv.supplier_id) || {
          supplier_id: inv.supplier_id,
          supplier_name: inv.supplier_name,
          outstanding: 0,
          open_count: 0,
          oldest_age: 0,
          last_invoice_date: null,
        };
        cur.outstanding += inv.total_amount;
        cur.open_count += 1;
        cur.oldest_age = Math.max(cur.oldest_age, inv.age_days);
        supMap.set(inv.supplier_id, cur);
      }
      // Last invoice date from all invoices for that supplier
      for (const [sid, sum] of supMap) {
        const all = allBySupplier.get(sid) || [];
        const last = all
          .map((x: any) => x.invoice_date)
          .sort()
          .pop();
        sum.last_invoice_date = last || null;
        sum.outstanding = Math.round(sum.outstanding * 100) / 100;
      }
      const sumArr = Array.from(supMap.values()).sort(
        (a, b) => b.outstanding - a.outstanding
      );
      setSupplierSummary(sumArr);

      // Paid this month (sum from invoice_payments)
      const { data: pays } = await supabase
        .from("invoice_payments")
        .select("amount, payment_date")
        .gte("payment_date", monthStart);
      setPaidThisMonth(
        (pays || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
      );

      // Payroll-related payables (Salary Payable + MPF Payable) — net balance from journal
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
          // liability normal-side: credit - debit
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

      setLoading(false);
    })();
  }, [refreshKey]);

  return { openInvoices, supplierSummary, paidThisMonth, payrollPayables, loading, refresh };
}
