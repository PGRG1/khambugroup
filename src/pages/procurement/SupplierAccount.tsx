import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePayables, type APInvoice, type APCreditNote } from "@/hooks/usePayables";
import { RecordPaymentDialog } from "@/components/finance/payables/RecordPaymentDialog";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import { ExerciseCreditDialog } from "@/components/procurement/ExerciseCreditDialog";
import { AddChargeDialog } from "@/components/procurement/AddChargeDialog";
import SupplierAccountsSection from "@/components/expenses/SupplierAccountsSection";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};

type LedgerType =
  | "opening_balance"
  | "invoice" | "payment" | "credit_note" | "credit_applied" | "charge"
  | "refund" | "incentive" | "deposit" | "deposit_refund";

const TYPE_CONFIG: Record<LedgerType, { label: string; className: string }> = {
  opening_balance:{ label: "Opening bal",  className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  invoice:        { label: "Invoice",       className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  payment:        { label: "Payment",       className: "bg-green-500/15 text-green-400 border-green-500/30" },
  credit_note:    { label: "Credit note",   className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  credit_applied: { label: "CN applied",    className: "bg-green-500/15 text-green-400 border-green-500/30" },
  charge:         { label: "Charge",        className: "bg-red-500/15 text-red-400 border-red-500/30" },
  refund:         { label: "Refund",        className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  incentive:      { label: "Incentive",     className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  deposit:        { label: "Deposit",       className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  deposit_refund: { label: "Deposit refund", className: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
};

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "3m", label: "Last 3 months" },
  { value: "year", label: "This year" },
];

function periodStart(value: string): string | null {
  const now = new Date();
  if (value === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (value === "3m") return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  if (value === "year") return `${now.getFullYear()}-01-01`;
  return null;
}

function KCard({ label, value, tone = "default", sub }: { label: string; value: string; tone?: "default" | "amber" | "green" | "red" | "sky"; sub?: React.ReactNode }) {
  const toneCls =
    tone === "amber" ? "text-amber-400" :
    tone === "green" ? "text-emerald-400" :
    tone === "red" ? "text-red-400" :
    tone === "sky" ? "text-sky-400" :
    "text-foreground";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold td-num ${toneCls}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function SupplierAccountPage() {
  const { supplierId = "" } = useParams<{ supplierId: string }>();
  const location = useLocation();
  const navState = (location.state || {}) as { openTab?: string; highlightInvoiceId?: string };
  const [activeTab, setActiveTab] = useState<string>(navState.openTab || "statement");
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(navState.highlightInvoiceId || null);
  useEffect(() => {
    if (!highlightInvoiceId) return;
    const t = setTimeout(() => setHighlightInvoiceId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightInvoiceId]);
  const { tenantId } = useActiveTenant();
  const { invoices, creditNotes, creditNotesAvailable, bankAccounts, loading: payLoading, refresh } = usePayables();

  const [supplierName, setSupplierName] = useState("");
  const [venues, setVenues] = useState<string[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<any[]>([]);
  const [refundLines, setRefundLines] = useState<any[]>([]);
  const [depositLines, setDepositLines] = useState<any[]>([]);
  const [openingBalances, setOpeningBalances] = useState<any[]>([]);
  const [openingDeposits, setOpeningDeposits] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; internal_sku: string | null }[]>([]);
  const [period, setPeriod] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Dialog state
  const [payInvoice, setPayInvoice] = useState<APInvoice | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [bookCNOpen, setBookCNOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [addDealOpen, setAddDealOpen] = useState(false);

  const allSupplierInvoices = useMemo(
    () => invoices.filter((i) => i.supplier_id === supplierId),
    [invoices, supplierId]
  );
  const supplierInvoices = useMemo(
    () => (selectedAccountId
      ? allSupplierInvoices.filter((i) => (i as any).supplier_account_id === selectedAccountId)
      : allSupplierInvoices),
    [allSupplierInvoices, selectedAccountId]
  );
  const invoiceAccountMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const i of allSupplierInvoices) m.set(i.id, (i as any).supplier_account_id || null);
    return m;
  }, [allSupplierInvoices]);
  const billCountsByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of allSupplierInvoices) {
      const aid = (i as any).supplier_account_id as string | null;
      if (aid) m[aid] = (m[aid] || 0) + 1;
    }
    return m;
  }, [allSupplierInvoices]);
  const allSupplierCNs = useMemo(
    () => creditNotes.filter((cn) => cn.supplier_id === supplierId),
    [creditNotes, supplierId]
  );
  const supplierCNs = useMemo(
    () => (selectedAccountId
      ? allSupplierCNs.filter((cn) => cn.source_invoice_id && invoiceAccountMap.get(cn.source_invoice_id) === selectedAccountId)
      : allSupplierCNs),
    [allSupplierCNs, selectedAccountId, invoiceAccountMap]
  );
  const supplierAvailableCNs = useMemo(
    () => {
      const base = creditNotesAvailable.filter((cn) => cn.supplier_id === supplierId);
      return selectedAccountId
        ? base.filter((cn) => cn.source_invoice_id && invoiceAccountMap.get(cn.source_invoice_id) === selectedAccountId)
        : base;
    },
    [creditNotesAvailable, supplierId, selectedAccountId, invoiceAccountMap]
  );
  const allSupplierPayments = useMemo(
    () => payments.filter((p) => p.supplier_id === supplierId),
    [payments, supplierId]
  );
  const supplierPayments = useMemo(() => {
    if (!selectedAccountId) return allSupplierPayments;
    const paymentIdsForAccount = new Set(
      allocs
        .filter((a) => a.invoice_id && invoiceAccountMap.get(a.invoice_id) === selectedAccountId)
        .map((a) => a.payment_id)
    );
    return allSupplierPayments.filter((p) => paymentIdsForAccount.has(p.id));
  }, [allSupplierPayments, allocs, selectedAccountId, invoiceAccountMap]);

  // Load supplier + tenant-scoped joined data
  useEffect(() => {
    if (!tenantId || !supplierId) return;
    (async () => {
      const { data: sup } = await (supabase as any)
        .from("suppliers")
        .select("id, name")
        .eq("id", supplierId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      setSupplierName(sup?.name || "Supplier");

      const grnRows = await fetchAllRows("goods_received_notes", "venue", undefined, tenantId);
      const set = new Set<string>();
      for (const r of grnRows as any[]) if (r.venue) set.add(String(r.venue));
      setVenues(Array.from(set).sort());

      // Payments + allocations (no tenant filter — these tables have none)
      const [pays, alcs] = await Promise.all([
        fetchAllRows("payments", "id, payment_date, amount, payment_method, paid_from_account_id, reference_number, cheque_number, notes, supplier_id, match_status"),
        fetchAllRows("payment_allocations", "id, payment_id, invoice_id, amount_allocated, credit_note_id, credit_note_amount_applied"),
      ]);
      setPayments(pays);
      setAllocs(alcs);

      // Invoice lines joined with product_master + invoices (tenant-scoped on line items)
      const { data: lines } = await (supabase as any)
        .from("invoice_line_items")
        .select("id, quantity, unit_price, total, invoice_id, product_master_id, description, product_master!product_master_id(name, financial_treatment), invoices!invoice_id(supplier_id, invoice_date, venue, discount_type, invoice_number)")
        .eq("tenant_id", tenantId);
      const filtered = (lines || []).filter((l: any) => l.invoices?.supplier_id === supplierId);

      const refunds = filtered.filter((l: any) => {
        const ft = l.product_master?.financial_treatment;
        const dt = l.invoices?.discount_type;
        return (ft && /Supplier Refund/i.test(ft)) || dt === "refund";
      });
      setRefundLines(refunds);

      const deps = filtered.filter((l: any) => {
        const ft = l.product_master?.financial_treatment;
        return ft && /^Asset - Supplier Deposit/i.test(ft);
      });
      setDepositLines(deps);

      // Deals
      const { data: dealRows } = await (supabase as any)
        .from("item_supplier_deals")
        .select("id, deal_type, product_id, buy_qty, free_qty, notes, is_active, product_master!product_id(name, internal_sku)")
        .eq("supplier_id", supplierId)
        .eq("tenant_id", tenantId);
      setDeals(dealRows || []);

      // Products for deal picker
      const prodRows = await fetchAllRows("product_master", "id, name, internal_sku", { col: "name", asc: true }, tenantId);
      setProducts(prodRows as any[]);

      // Opening balances (supplier payables + deposits)
      const [{ data: obRows }, { data: odRows }] = await Promise.all([
        (supabase as any)
          .from("supplier_opening_balances")
          .select("id, as_of_date, amount, venue, notes")
          .eq("supplier_id", supplierId)
          .eq("tenant_id", tenantId),
        (supabase as any)
          .from("deposit_opening_balances")
          .select("id, as_of_date, sku, description, quantity, unit_value, total_value, venue, notes")
          .eq("supplier_id", supplierId)
          .eq("tenant_id", tenantId),
      ]);
      setOpeningBalances(obRows || []);
      setOpeningDeposits(odRows || []);
    })();
  }, [tenantId, supplierId, refreshKey]);

  const refetch = () => { refresh(); setRefreshKey((k) => k + 1); };

  // Aggregates
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const outstanding = useMemo(() => supplierInvoices.filter((i) => i.outstanding_amount > 0 && i.payment_status !== "voided").reduce((s, i) => s + i.outstanding_amount, 0), [supplierInvoices]);
  const overdue = useMemo(() => supplierInvoices.filter((i) => i.outstanding_amount > 0 && i.due_date && i.due_date < todayStr).reduce((s, i) => s + i.outstanding_amount, 0), [supplierInvoices, todayStr]);
  const availableCreditsTotal = useMemo(() => supplierAvailableCNs.reduce((s, c) => s + c.remaining_balance, 0), [supplierAvailableCNs]);

  const allocSumByPayment = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocs) m.set(a.payment_id, (m.get(a.payment_id) || 0) + (Number(a.amount_allocated) || 0));
    return m;
  }, [allocs]);

  const unallocatedPayments = useMemo(() => {
    let s = 0;
    for (const p of supplierPayments) {
      const amt = Number(p.amount) || 0;
      const alloc = allocSumByPayment.get(p.id) || 0;
      s += Math.max(0, amt - alloc);
    }
    return s;
  }, [supplierPayments, allocSumByPayment]);

  const scopedRefundLines = useMemo(
    () => (selectedAccountId
      ? refundLines.filter((l: any) => invoiceAccountMap.get(l.invoice_id) === selectedAccountId)
      : refundLines),
    [refundLines, selectedAccountId, invoiceAccountMap]
  );
  const scopedDepositLines = useMemo(
    () => (selectedAccountId
      ? depositLines.filter((l: any) => invoiceAccountMap.get(l.invoice_id) === selectedAccountId)
      : depositLines),
    [depositLines, selectedAccountId, invoiceAccountMap]
  );

  const depositsOutstanding = useMemo(() => {
    let paid = 0, returned = 0;
    for (const l of scopedDepositLines) {
      const t = Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      if (t >= 0) paid += t; else returned += Math.abs(t);
    }
    return paid - returned;
  }, [scopedDepositLines]);

  // Ledger build
  type Entry = { id: string; date: string; type: LedgerType; reference: string; description: string; venue: string; debit: number; credit: number; balance?: number };

  const ledger = useMemo<Entry[]>(() => {
    const entries: Entry[] = [];
    openingBalances.forEach((row) => {
      entries.push({
        id: `ob-${row.id}`,
        date: row.as_of_date,
        type: "opening_balance",
        reference: "Opening balance",
        description: (row.notes && String(row.notes).trim()) || `Opening balance as of ${fmtDate(row.as_of_date)}`,
        venue: row.venue || "",
        debit: Number(row.amount) || 0,
        credit: 0,
      });
    });
    supplierInvoices.forEach((inv) => {
      const isCharge = inv.invoice_number?.startsWith("CHARGE-");
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.invoice_date,
        type: isCharge ? "charge" : "invoice",
        reference: inv.invoice_number,
        description: isCharge ? "Charge / adjustment" : `Invoice`,
        venue: inv.venue || "",
        debit: inv.total_amount,
        credit: 0,
      });
    });
    supplierPayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt > 0) entries.push({
        id: `pay-${p.id}`,
        date: p.payment_date,
        type: "payment",
        reference: p.reference_number || p.payment_method || "",
        description: `Payment — ${p.payment_method || ""}`,
        venue: "",
        debit: 0,
        credit: amt,
      });
    });
    supplierCNs.filter((cn) => cn.status !== "voided").forEach((cn) => {
      const applied = cn.applied_amount || (cn.original_amount - cn.remaining_balance);
      if (applied > 0.01) entries.push({
        id: `cna-${cn.id}`,
        date: cn.credit_note_date,
        type: "credit_applied",
        reference: cn.credit_note_number,
        description: `Credit applied — ${cn.notes || ""}`,
        venue: cn.venue || "",
        debit: 0,
        credit: applied,
      });
      if (cn.status !== "fully_applied") entries.push({
        id: `cn-${cn.id}`,
        date: cn.credit_note_date,
        type: "credit_note",
        reference: cn.credit_note_number,
        description: `Credit note booked — ${cn.notes || ""}`,
        venue: cn.venue || "",
        debit: 0,
        credit: 0,
      });
    });
    scopedRefundLines.forEach((l) => {
      const total = Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      entries.push({
        id: `ref-${l.id}`,
        date: l.invoices?.invoice_date,
        type: "refund",
        reference: l.invoices?.invoice_number || "",
        description: `Refund — ${l.product_master?.name || l.description || ""}`,
        venue: l.invoices?.venue || "",
        debit: 0,
        credit: Math.abs(total),
      });
    });
    scopedDepositLines.forEach((l) => {
      const total = Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      if (total >= 0) entries.push({
        id: `dep-${l.id}`,
        date: l.invoices?.invoice_date,
        type: "deposit",
        reference: l.invoices?.invoice_number || "",
        description: `Deposit — ${l.product_master?.name || l.description || ""}`,
        venue: l.invoices?.venue || "",
        debit: total,
        credit: 0,
      });
      else entries.push({
        id: `dep-${l.id}`,
        date: l.invoices?.invoice_date,
        type: "deposit_refund",
        reference: l.invoices?.invoice_number || "",
        description: `Deposit refund — ${l.product_master?.name || l.description || ""}`,
        venue: l.invoices?.venue || "",
        debit: 0,
        credit: Math.abs(total),
      });
    });

    const sorted = entries.sort((a, b) => {
      if (a.type === "opening_balance" && b.type !== "opening_balance") return -1;
      if (b.type === "opening_balance" && a.type !== "opening_balance") return 1;
      return (a.date || "").localeCompare(b.date || "");
    });
    let balance = 0;
    return sorted.map((e) => {
      balance = balance + (e.debit || 0) - (e.credit || 0);
      return { ...e, balance };
    });
  }, [supplierInvoices, supplierPayments, supplierCNs, scopedRefundLines, scopedDepositLines, openingBalances]);

  const filteredLedger = useMemo(() => {
    const start = periodStart(period);
    if (!start) return ledger;
    return ledger.filter((e) => (e.date || "") >= start);
  }, [ledger, period]);

  const ledgerTotals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const e of filteredLedger) { dr += e.debit || 0; cr += e.credit || 0; }
    return { dr, cr, net: dr - cr };
  }, [filteredLedger]);

  const exportLedger = () => {
    downloadCSV(
      filteredLedger.map((e) => ({
        date: e.date || "",
        type: TYPE_CONFIG[e.type].label,
        reference: e.reference,
        description: e.description,
        venue: e.venue || "",
        charges: (e.debit || 0).toFixed(2),
        credits: (e.credit || 0).toFixed(2),
        balance: (e.balance || 0).toFixed(2),
      })),
      [
        { key: "date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "reference", label: "Reference" },
        { key: "description", label: "Description" },
        { key: "venue", label: "Venue" },
        { key: "charges", label: "Charges" },
        { key: "credits", label: "Credits" },
        { key: "balance", label: "Balance" },
      ],
      `${supplierName.replace(/\s+/g, "_")}_statement`
    );
  };

  const openInvoicesList = supplierInvoices.filter((i) => i.outstanding_amount > 0 && i.payment_status !== "voided");
  const handlePayInvoice = (inv: APInvoice) => { setPayInvoice(inv); setRecordPaymentOpen(true); };
  const handleRecordPayment = () => {
    const oldest = [...openInvoicesList].sort((a, b) => (a.due_date || a.invoice_date).localeCompare(b.due_date || b.invoice_date))[0];
    if (oldest) handlePayInvoice(oldest);
    else toast.info("No open invoices to pay");
  };

  const handleVoidCN = async (cnId: string) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from("credit_notes")
      .update({ status: "voided", remaining_balance: 0, updated_at: new Date().toISOString() })
      .eq("id", cnId)
      .eq("tenant_id", tenantId);
    if (error) toast.error("Failed to void credit note");
    else { toast.success("Credit note voided"); refetch(); }
  };
  const handleApproveCN = async (cnId: string) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from("credit_notes")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", cnId)
      .eq("tenant_id", tenantId);
    if (error) toast.error("Failed to approve credit note");
    else { toast.success("Credit note approved"); refetch(); }
  };
  const handleDeleteDeal = async (id: string) => {
    if (!tenantId) return;
    const { error } = await (supabase as any).from("item_supplier_deals").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) toast.error("Failed to delete deal"); else { toast.success("Deal deleted"); refetch(); }
  };
  const handleToggleDeal = async (id: string, active: boolean) => {
    if (!tenantId) return;
    const { error } = await (supabase as any).from("item_supplier_deals").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
    if (error) toast.error("Failed to update deal"); else refetch();
  };

  const pendingCNs = supplierCNs.filter((c) => c.status === "draft" || c.status === "needs_review");
  const historicalCNs = supplierCNs.filter((c) => c.status === "fully_applied" || c.status === "voided");

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link to="/procurement/finance/suppliers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Supplier Accounts
        </Link>
        <div className="mt-2 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight font-display">{supplierName || "—"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{supplierId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRecordPayment}>Record Payment</Button>
            <Button size="sm" variant="outline" disabled={availableCreditsTotal === 0} onClick={() => setExerciseOpen(true)}>Apply Credit</Button>
            <Button size="sm" variant="outline" onClick={() => setBookCNOpen(true)}>Book Credit Note</Button>
            <Button size="sm" variant="outline" onClick={() => setAddChargeOpen(true)}>Add Charge</Button>
            <Button size="sm" variant="outline" onClick={() => setBookCNOpen(true)}>Record Refund</Button>
            <Button size="sm" variant="ghost" onClick={exportLedger}>Export</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KCard label="Outstanding" value={fmtMoney(outstanding)} tone={outstanding > 0 ? "amber" : "default"} />
        <KCard label="Overdue" value={fmtMoney(overdue)} tone="red" />
        <KCard label="Available credits" value={fmtMoney(availableCreditsTotal)} tone="green" />
        <KCard label="Unallocated payments" value={fmtMoney(unallocatedPayments)} tone={unallocatedPayments > 0 ? "amber" : "default"} />
        <KCard label="Deposits outstanding" value={fmtMoney(depositsOutstanding)} tone="sky" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0">
          {[
            { v: "statement", l: "Statement" },
            { v: "open", l: "Open Documents" },
            { v: "payments", l: "Payments" },
            { v: "credits", l: "Credits & Adjustments" },
            { v: "incentives", l: "Incentives" },
            { v: "deposits", l: "Deposits" },
          ].map((t) => (
            <TabsTrigger key={t.v} value={t.v}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-400 data-[state=active]:text-amber-400 data-[state=active]:bg-transparent px-4 py-2 text-sm">
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* STATEMENT */}
        <TabsContent value="statement" className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">{filteredLedger.length} entries</div>
          </div>
          <Card className="card-glass">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-3 w-[110px]">Date</th>
                      <th className="text-left py-2 px-3 w-[120px]">Type</th>
                      <th className="text-left py-2 px-3 w-[140px]">Reference</th>
                      <th className="text-left py-2 px-3">Description</th>
                      <th className="text-left py-2 px-3 w-[110px]">Venue</th>
                      <th className="text-right py-2 px-3 w-[110px]">Charges</th>
                      <th className="text-right py-2 px-3 w-[110px]">Credits</th>
                      <th className="text-right py-2 px-3 w-[130px]">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payLoading ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-6">Loading…</td></tr>
                    ) : filteredLedger.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No entries.</td></tr>
                    ) : filteredLedger.map((e) => {
                      const cfg = TYPE_CONFIG[e.type];
                      const bal = e.balance || 0;
                      return (
                        <tr key={e.id} className="border-b border-border/30">
                          <td className="py-2 px-3 td-num tabular-nums">{fmtDate(e.date)}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge></td>
                          <td className="py-2 px-3 font-mono text-xs">{e.reference}</td>
                          <td className="py-2 px-3 truncate max-w-[320px]" title={e.description}>{e.description}</td>
                          <td className="py-2 px-3 text-muted-foreground">{e.venue || "—"}</td>
                          <td className={`py-2 px-3 text-right td-num tabular-nums ${e.debit > 0 ? "text-amber-400" : "text-muted-foreground/40"}`}>{e.debit > 0 ? fmt(e.debit) : "—"}</td>
                          <td className={`py-2 px-3 text-right td-num tabular-nums ${e.credit > 0 ? "text-emerald-400" : "text-muted-foreground/40"}`}>{e.credit > 0 ? fmt(e.credit) : "—"}</td>
                          <td className={`py-2 px-3 text-right td-num tabular-nums ${bal > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(Math.abs(bal))} {bal >= 0 ? "Dr" : "Cr"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredLedger.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20 text-sm font-semibold">
                        <td colSpan={5} className="py-2 px-3 text-right text-muted-foreground">Totals</td>
                        <td className="py-2 px-3 text-right td-num tabular-nums text-amber-400">{fmt(ledgerTotals.dr)}</td>
                        <td className="py-2 px-3 text-right td-num tabular-nums text-emerald-400">{fmt(ledgerTotals.cr)}</td>
                        <td className={`py-2 px-3 text-right td-num tabular-nums ${ledgerTotals.net > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(Math.abs(ledgerTotals.net))} {ledgerTotals.net >= 0 ? "Dr" : "Cr"}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPEN DOCUMENTS */}
        <TabsContent value="open" className="mt-6 space-y-6">
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Unpaid invoices ({openInvoicesList.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Invoice #</th>
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Due</th>
                      <th className="text-right py-2 pr-4">Total</th>
                      <th className="text-right py-2 pr-4">Paid</th>
                      <th className="text-right py-2 pr-4">Outstanding</th>
                      <th className="text-right py-2 pr-4">Age</th>
                      <th className="text-right py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoicesList.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No unpaid invoices.</td></tr>
                    ) : openInvoicesList.map((inv) => (
                      <tr key={inv.id} className="border-b border-border/30">
                        <td className="py-2 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.invoice_date)}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.due_date)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums">{fmt(inv.total_amount)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmt(inv.amount_paid)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums text-amber-400">{fmt(inv.outstanding_amount)}</td>
                        <td className={`py-2 pr-4 text-right td-num tabular-nums ${inv.age_days > 60 ? "text-red-400" : ""}`}>{inv.age_days}d</td>
                        <td className="py-2 text-right"><Button size="sm" variant="outline" onClick={() => handlePayInvoice(inv)}>Pay this</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Unapplied credits ({supplierAvailableCNs.length})</div>
              <CreditTable rows={supplierAvailableCNs} showRemaining actions={(cn) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setExerciseOpen(true)}>Exercise</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleVoidCN(cn.id)}>Void</Button>
                </>
              )} />
            </CardContent>
          </Card>

          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Unallocated payments</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-right py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Method</th>
                      <th className="text-left py-2 pr-4">Reference</th>
                      <th className="text-right py-2 pr-4">Allocated</th>
                      <th className="text-right py-2 pr-4">Unallocated</th>
                      <th className="text-right py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = supplierPayments
                        .map((p) => {
                          const amt = Number(p.amount) || 0;
                          const alloc = allocSumByPayment.get(p.id) || 0;
                          return { p, amt, alloc, unalloc: Math.max(0, amt - alloc) };
                        })
                        .filter((r) => r.unalloc > 0.01);
                      if (rows.length === 0) return <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No unallocated payments.</td></tr>;
                      return rows.map(({ p, amt, alloc, unalloc }) => (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-2 pr-4">{fmtDate(p.payment_date)}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{fmt(amt)}</td>
                          <td className="py-2 pr-4">{p.payment_method || "—"}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{p.reference_number || "—"}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmt(alloc)}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-amber-400">{fmt(unalloc)}</td>
                          <td className="py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => toast.info("Use Finance → Accounts Payable to allocate payments to invoices.")}>Allocate</Button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="mt-6">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={handleRecordPayment}>Record payment</Button>
          </div>
          <Card className="card-glass">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">Method</th>
                      <th className="text-left py-2 px-3">Reference</th>
                      <th className="text-right py-2 px-3">Invoices settled</th>
                      <th className="text-right py-2 px-3">CN applied</th>
                      <th className="text-left py-2 px-3">Bank status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierPayments.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No payments recorded.</td></tr>
                    ) : [...supplierPayments].sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || "")).map((p) => {
                      const palls = allocs.filter((a) => a.payment_id === p.id);
                      const invCount = new Set(palls.map((a) => a.invoice_id).filter(Boolean)).size;
                      const cnApplied = palls.reduce((s, a) => s + (Number(a.credit_note_amount_applied) || 0), 0);
                      const ms = p.match_status || "awaiting_bank_match";
                      const msCfg =
                        ms === "matched" ? { l: "Cleared", cls: "bg-green-500/15 text-green-400 border-green-500/30" } :
                        ms === "not_required" ? { l: "No bank match", cls: "bg-muted text-muted-foreground" } :
                        { l: "Awaiting match", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
                      return (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-2 px-3">{fmtDate(p.payment_date)}</td>
                          <td className="py-2 px-3 text-right td-num tabular-nums text-emerald-400">{fmt(Number(p.amount) || 0)}</td>
                          <td className="py-2 px-3">{p.payment_method || "—"}</td>
                          <td className="py-2 px-3 font-mono text-xs">{p.reference_number || "—"}</td>
                          <td className="py-2 px-3 text-right td-num tabular-nums">{invCount}</td>
                          <td className="py-2 px-3 text-right td-num tabular-nums">{cnApplied > 0 ? fmt(cnApplied) : "—"}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className={`text-[10px] ${msCfg.cls}`}>{msCfg.l}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CREDITS & ADJUSTMENTS */}
        <TabsContent value="credits" className="mt-6 space-y-6">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setBookCNOpen(true)}>Book credit note</Button>
          </div>
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Available credits</div>
              <CreditTable rows={supplierAvailableCNs} showRemaining actions={(cn) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setExerciseOpen(true)}>Exercise</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleVoidCN(cn.id)}>Void</Button>
                </>
              )} />
            </CardContent>
          </Card>
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Pending credits</div>
              <CreditTable rows={pendingCNs} showStatus actions={(cn) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => handleApproveCN(cn.id)}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleVoidCN(cn.id)}>Void</Button>
                </>
              )} />
            </CardContent>
          </Card>
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Refunds received</div>
              <div className="text-xs text-muted-foreground mb-2">Refunds settle existing credits — they do not reduce procurement cost.</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Reference</th>
                      <th className="text-left py-2 pr-4">Description</th>
                      <th className="text-right py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Linked CN</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundLines.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No refunds recorded.</td></tr>
                    ) : refundLines.map((l) => {
                      const total = Math.abs(Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0));
                      return (
                        <tr key={l.id} className="border-b border-border/30">
                          <td className="py-2 pr-4">{fmtDate(l.invoices?.invoice_date)}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{l.invoices?.invoice_number || "—"}</td>
                          <td className="py-2 pr-4">{l.product_master?.name || l.description || "—"}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{fmt(total)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">—</td>
                          <td className="py-2"><Badge variant="outline" className="text-[10px]">Recorded</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Historical</div>
              <CreditTable rows={historicalCNs} showStatus />
            </CardContent>
          </Card>
        </TabsContent>

        {/* INCENTIVES */}
        <TabsContent value="incentives" className="mt-6 space-y-6">
          <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            Rebates, volume incentives, and milestone rewards are recorded manually. Use the Book Credit Note workflow to record an earned incentive when received from the supplier. Incentive tracking and auto-calculation are not yet available.
          </div>

          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Buy-X-Get-Y-Free Deals ({deals.length})</div>
                <Button size="sm" onClick={() => setAddDealOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add deal</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Deal type</th>
                      <th className="text-left py-2 pr-4">Product</th>
                      <th className="text-right py-2 pr-4">Buy qty</th>
                      <th className="text-right py-2 pr-4">Free qty</th>
                      <th className="text-left py-2 pr-4">Notes</th>
                      <th className="text-left py-2 pr-4">Active</th>
                      <th className="text-right py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No deals configured for this supplier.</td></tr>
                    ) : deals.map((d) => (
                      <tr key={d.id} className="border-b border-border/30">
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-[10px] bg-teal-500/15 text-teal-400 border-teal-500/30">{d.deal_type}</Badge>
                        </td>
                        <td className="py-2 pr-4">{d.product_master?.name || "—"} <span className="text-muted-foreground text-xs">{d.product_master?.internal_sku || ""}</span></td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums">{d.buy_qty}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{d.free_qty}</td>
                        <td className="py-2 pr-4 truncate max-w-[240px]" title={d.notes || ""}>{d.notes || "—"}</td>
                        <td className="py-2 pr-4"><Switch checked={!!d.is_active} onCheckedChange={(v) => handleToggleDeal(d.id, v)} /></td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteDeal(d.id)}>Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Other Incentives & Rebates</div>
              <div className="text-sm text-muted-foreground py-6 text-center">
                No manual incentive notes recorded.
                <div className="text-xs mt-1">Earned incentives should be settled via a credit note booked in Credits & Adjustments.</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEPOSITS */}
        <TabsContent value="deposits" className="mt-6">
          <Card className="card-glass">
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground mb-3">Deposits are balance sheet items and do not affect procurement cost or inventory.</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Invoice #</th>
                      <th className="text-left py-2 pr-4">Description</th>
                      <th className="text-right py-2 pr-4">Charged</th>
                      <th className="text-right py-2 pr-4">Returned</th>
                      <th className="text-right py-2 pr-4">Net</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      type DRow = { key: string; date: string; invoiceNo: string; description: string; charged: number; returned: number; net: number; isOpening: boolean };
                      const invRows: DRow[] = depositLines.map((l) => {
                        const total = Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
                        return {
                          key: `dep-${l.id}`,
                          date: l.invoices?.invoice_date || "",
                          invoiceNo: l.invoices?.invoice_number || "—",
                          description: l.product_master?.name || l.description || "—",
                          charged: total >= 0 ? total : 0,
                          returned: total < 0 ? Math.abs(total) : 0,
                          net: total,
                          isOpening: false,
                        };
                      });
                      const obRows: DRow[] = openingDeposits.map((d) => {
                        const total = Number(d.total_value) || (Number(d.quantity) || 0) * (Number(d.unit_value) || 0);
                        return {
                          key: `od-${d.id}`,
                          date: d.as_of_date || "",
                          invoiceNo: "Opening",
                          description: d.description || "—",
                          charged: total,
                          returned: 0,
                          net: total,
                          isOpening: true,
                        };
                      });
                      const rows = [...invRows, ...obRows].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
                      const totalCharged = rows.reduce((s, r) => s + r.charged, 0);
                      const totalReturned = rows.reduce((s, r) => s + r.returned, 0);
                      const totalNet = totalCharged - totalReturned;
                      return (
                        <>
                          {rows.length === 0 ? (
                            <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No deposit transactions.</td></tr>
                          ) : rows.map((r) => (
                            <tr key={r.key} className="border-b border-border/30">
                              <td className="py-2 pr-4">{fmtDate(r.date)}</td>
                              <td className="py-2 pr-4 font-mono text-xs">{r.invoiceNo}</td>
                              <td className="py-2 pr-4">{r.description}</td>
                              <td className="py-2 pr-4 text-right td-num tabular-nums">{r.charged > 0 ? fmt(r.charged) : "—"}</td>
                              <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{r.returned > 0 ? fmt(r.returned) : "—"}</td>
                              <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.net > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(r.net)}</td>
                              <td className="py-2">
                                {r.isOpening ? (
                                  <Badge variant="outline" className="text-[10px] bg-zinc-500/15 text-zinc-300 border-zinc-500/30">Opening</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px]">{r.net > 0 ? "Outstanding" : "Returned"}</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}
                  </tbody>
                  {(depositLines.length > 0 || openingDeposits.length > 0) && (() => {
                    const invCharged = depositLines.reduce((s, l) => { const t = Number(l.total) || 0; return s + (t > 0 ? t : 0); }, 0);
                    const invReturned = depositLines.reduce((s, l) => { const t = Number(l.total) || 0; return s + (t < 0 ? Math.abs(t) : 0); }, 0);
                    const obCharged = openingDeposits.reduce((s, d) => s + (Number(d.total_value) || (Number(d.quantity) || 0) * (Number(d.unit_value) || 0)), 0);
                    const tCharged = invCharged + obCharged;
                    const tReturned = invReturned;
                    const tNet = tCharged - tReturned;
                    return (
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20 text-sm font-semibold">
                          <td colSpan={3} className="py-2 pr-4 text-right text-muted-foreground">Totals</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums">{fmt(tCharged)}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{fmt(tReturned)}</td>
                          <td className={`py-2 pr-4 text-right td-num tabular-nums ${tNet > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(tNet)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RecordPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={(o) => { setRecordPaymentOpen(o); if (!o) setPayInvoice(null); }}
        invoice={payInvoice}
        supplierInvoices={supplierInvoices}
        bankAccounts={bankAccounts}
        creditNotes={supplierAvailableCNs}
        onSaved={() => { setRecordPaymentOpen(false); setPayInvoice(null); refetch(); }}
      />
      <ExerciseCreditDialog
        open={exerciseOpen}
        onOpenChange={setExerciseOpen}
        supplierId={supplierId}
        supplierName={supplierName}
        availableCNs={supplierAvailableCNs}
        openInvoices={openInvoicesList}
        bankAccounts={bankAccounts}
        tenantId={tenantId || ""}
        onSaved={() => { setExerciseOpen(false); refetch(); }}
      />
      <BookCreditNoteDialog
        open={bookCNOpen}
        onOpenChange={setBookCNOpen}
        suppliers={[[supplierId, supplierName]]}
        venues={venues}
        invoices={supplierInvoices}
        defaultSupplierId={supplierId}
        onSaved={() => { setBookCNOpen(false); refetch(); }}
      />
      <AddChargeDialog
        open={addChargeOpen}
        onOpenChange={setAddChargeOpen}
        supplierId={supplierId}
        supplierName={supplierName}
        tenantId={tenantId || ""}
        openInvoices={openInvoicesList}
        onSaved={() => { setAddChargeOpen(false); refetch(); }}
      />
      <AddDealDialog
        open={addDealOpen}
        onOpenChange={setAddDealOpen}
        supplierId={supplierId}
        tenantId={tenantId || ""}
        products={products}
        onSaved={() => { setAddDealOpen(false); refetch(); }}
      />
    </div>
  );
}

function CreditTable({
  rows, showRemaining, showStatus, actions,
}: {
  rows: APCreditNote[];
  showRemaining?: boolean;
  showStatus?: boolean;
  actions?: (cn: APCreditNote) => React.ReactNode;
}) {
  if (rows.length === 0) return <div className="text-sm text-muted-foreground py-3">None.</div>;
  const statusBadge = (s: string) => {
    if (s === "draft") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Draft</Badge>;
    if (s === "needs_review") return <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">Needs review</Badge>;
    if (s === "approved") return <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30">Approved</Badge>;
    if (s === "fully_applied") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Fully applied</Badge>;
    if (s === "voided") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground line-through">Voided</Badge>;
    return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left py-2 pr-4">CN #</th>
            <th className="text-left py-2 pr-4">Date</th>
            <th className="text-right py-2 pr-4">Original</th>
            {showRemaining && <th className="text-right py-2 pr-4">Remaining</th>}
            {showStatus && <th className="text-left py-2 pr-4">Status</th>}
            <th className="text-left py-2 pr-4">Notes</th>
            {actions && <th className="text-right py-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((cn) => (
            <tr key={cn.id} className="border-b border-border/30">
              <td className="py-2 pr-4 font-mono text-xs">{cn.credit_note_number}</td>
              <td className="py-2 pr-4">{fmtDate(cn.credit_note_date)}</td>
              <td className="py-2 pr-4 text-right td-num tabular-nums">{fmt(cn.original_amount)}</td>
              {showRemaining && <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400 font-semibold">{fmt(cn.remaining_balance)}</td>}
              {showStatus && <td className="py-2 pr-4">{statusBadge(cn.status)}</td>}
              <td className="py-2 pr-4 truncate max-w-[260px]" title={cn.notes}>{cn.notes || "—"}</td>
              {actions && <td className="py-2 text-right space-x-1">{actions(cn)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddDealDialog({
  open, onOpenChange, supplierId, tenantId, products, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplierId: string;
  tenantId: string;
  products: { id: string; name: string; internal_sku: string | null }[];
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState<string>("");
  const [buyQty, setBuyQty] = useState("");
  const [freeQty, setFreeQty] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProductId(""); setBuyQty(""); setFreeQty(""); setNotes(""); setIsActive(true);
    }
  }, [open]);

  const save = async () => {
    if (!productId || !buyQty || !freeQty) { toast.error("Product, buy qty and free qty are required"); return; }
    if (!tenantId) { toast.error("No active tenant"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("item_supplier_deals").insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      product_id: productId,
      deal_type: "buy_x_get_y_free",
      buy_qty: Number(buyQty),
      free_qty: Number(freeQty),
      notes: notes || null,
      is_active: isActive,
    });
    setSaving(false);
    if (error) { toast.error("Failed to add deal: " + error.message); return; }
    toast.success("Deal added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add buy-X-get-Y-free deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} {p.internal_sku ? `· ${p.internal_sku}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Buy qty</Label>
              <Input value={buyQty} onChange={(e) => setBuyQty(e.target.value)} type="number" min="1" />
            </div>
            <div>
              <Label className="text-xs">Free qty</Label>
              <Input value={freeQty} onChange={(e) => setFreeQty(e.target.value)} type="number" min="1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add deal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
