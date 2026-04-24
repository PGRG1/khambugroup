import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import {
  CashflowEntry,
  PeriodGranularity,
  bucketEntries,
  applyOpeningBalance,
  PeriodBucket,
} from "@/utils/cashflowCalculations";

export interface CashflowSettings {
  id: string;
  opening_balance: number;
  opening_date: string;
  notes: string | null;
}

interface UseCashflowDataResult {
  loading: boolean;
  inflows: CashflowEntry[];
  outflows: CashflowEntry[];
  buckets: Array<PeriodBucket & { runningBalance: number }>;
  totals: { inflow: number; outflow: number; net: number; closing: number };
  settings: CashflowSettings | null;
  refetch: () => Promise<void>;
}

interface Options {
  granularity: PeriodGranularity;
  venueFilter: string; // "All Venues" or specific venue
  fromDate?: string; // ISO YYYY-MM-DD
  toDate?: string;
}

export function useCashflowData(opts: Options): UseCashflowDataResult {
  const [loading, setLoading] = useState(true);
  const [inflows, setInflows] = useState<CashflowEntry[]>([]);
  const [outflows, setOutflows] = useState<CashflowEntry[]>([]);
  const [settings, setSettings] = useState<CashflowSettings | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sales, invoices, payments, payroll, manual, settingsRows] = await Promise.all([
        fetchAllRows("sales_records", "date,venue,total_sales"),
        fetchAllRows("invoices", "id,venue,supplier_id"),
        fetchAllRows("invoice_payments", "invoice_id,payment_date,amount,payment_method,notes"),
        fetchAllRows("hr_payroll", "year,month,net_salary,mpf_payment_amount,net_salary_payment_date,mpf_payment_date,employee_id"),
        fetchAllRows("pl_manual_lines", "year,month,line_item_name,amount,notes"),
        (supabase.from("cashflow_settings" as any) as any).select("*").order("updated_at", { ascending: false }).limit(1),
      ]);

      // Settings
      const s = (settingsRows as any)?.data?.[0] ?? null;
      setSettings(s);

      // Index invoice -> venue
      const invoiceVenue = new Map<string, string>();
      invoices.forEach((i: any) => invoiceVenue.set(i.id, i.venue || ""));

      // Inflows from sales
      const salesIn: CashflowEntry[] = sales
        .filter((r: any) => Number(r.total_sales) > 0)
        .map((r: any) => ({
          date: r.date,
          amount: Number(r.total_sales) || 0,
          category: "sales" as const,
          label: `Sales — ${r.venue}`,
          venue: r.venue,
        }));

      // Outflows from invoice payments (true cash basis)
      const invoiceOut: CashflowEntry[] = payments.map((p: any) => ({
        date: p.payment_date,
        amount: Number(p.amount) || 0,
        category: "invoice" as const,
        label: p.notes || "Invoice payment",
        venue: invoiceVenue.get(p.invoice_id) || undefined,
        reference: p.invoice_id,
      }));

      // Outflows from payroll — net salary + MPF
      const payrollOut: CashflowEntry[] = [];
      payroll.forEach((p: any) => {
        if (p.net_salary_payment_date && Number(p.net_salary) > 0) {
          payrollOut.push({
            date: p.net_salary_payment_date,
            amount: Number(p.net_salary),
            category: "payroll_salary",
            label: `Payroll — ${p.year}-${String(p.month).padStart(2, "0")}`,
          });
        }
        if (p.mpf_payment_date && Number(p.mpf_payment_amount) > 0) {
          payrollOut.push({
            date: p.mpf_payment_date,
            amount: Number(p.mpf_payment_amount),
            category: "payroll_mpf",
            label: `MPF — ${p.year}-${String(p.month).padStart(2, "0")}`,
          });
        }
      });

      // Manual P&L lines: positive = inflow, negative = outflow. Date = first of month/year.
      const manualIn: CashflowEntry[] = [];
      const manualOut: CashflowEntry[] = [];
      manual.forEach((m: any) => {
        const month = m.month ? String(m.month).padStart(2, "0") : "01";
        const date = `${m.year}-${month}-01`;
        const amt = Number(m.amount) || 0;
        if (amt === 0) return;
        const entry: CashflowEntry = {
          date,
          amount: Math.abs(amt),
          category: "manual",
          label: m.line_item_name,
        };
        if (amt >= 0) manualIn.push(entry);
        else manualOut.push(entry);
      });

      // Apply venue filter (only to entries that have a venue field)
      const filterVenue = (e: CashflowEntry) => {
        if (opts.venueFilter === "All Venues") return true;
        if (!e.venue) return true; // keep entries without venue (payroll, manual)
        return e.venue === opts.venueFilter;
      };

      // Apply date range filter
      const filterDate = (e: CashflowEntry) => {
        if (opts.fromDate && e.date < opts.fromDate) return false;
        if (opts.toDate && e.date > opts.toDate) return false;
        return true;
      };

      const allIn = [...salesIn, ...manualIn].filter(filterVenue).filter(filterDate);
      const allOut = [...invoiceOut, ...payrollOut, ...manualOut].filter(filterVenue).filter(filterDate);

      setInflows(allIn);
      setOutflows(allOut);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [opts.granularity, opts.venueFilter, opts.fromDate, opts.toDate]);

  const buckets = bucketEntries(inflows, outflows, opts.granularity);
  const withRunning = applyOpeningBalance(
    buckets,
    settings?.opening_balance ?? 0,
    settings?.opening_date ?? new Date().toISOString().slice(0, 10),
  );

  const totals = {
    inflow: inflows.reduce((s, e) => s + e.amount, 0),
    outflow: outflows.reduce((s, e) => s + e.amount, 0),
    net: 0,
    closing: 0,
  };
  totals.net = totals.inflow - totals.outflow;
  totals.closing = (settings?.opening_balance ?? 0) + totals.net;

  return { loading, inflows, outflows, buckets: withRunning, totals, settings, refetch: load };
}
