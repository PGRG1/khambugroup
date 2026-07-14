import { kpiValueSizeClass } from "@/utils/kpiSize";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CreditCard, Download, Search, ExternalLink, MoreHorizontal,
  Wallet, CalendarClock, AlertTriangle, CheckCircle2, Link2, Coins,
  Banknote, ListChecks, Hourglass, FileWarning, Plus,
  PieChart, Calendar,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import { usePayables, type APInvoice, type APCreditNote } from "@/hooks/usePayables";
import { AGE_BUCKETS } from "@/hooks/useReceivables";
import { downloadCSV } from "@/utils/csvDownload";
import {
  PaymentStatusBadge, BankMatchBadge,
  PAYMENT_STATUS_OPTIONS, BANK_MATCH_OPTIONS, paymentStatusLabel, bankMatchLabel,
} from "@/components/finance/payables/StatusBadges";
import { RecordPaymentDialog } from "@/components/finance/payables/RecordPaymentDialog";
import { AllocatePaymentDialog } from "@/components/finance/payables/AllocatePaymentDialog";
import { PaymentHistoryDialog } from "@/components/finance/payables/PaymentHistoryDialog";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) =>
  n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};
const todayStr = () => new Date().toISOString().slice(0, 10);

type DueRange = "all" | "overdue" | "this_week" | "this_month" | "next_30";

// Aging: current → primary, near-term → info, mid → warning, old → destructive.
const BUCKET_COLOR: Record<string, string> = {
  "Current": "bg-primary",
  "1–30": "bg-info",
  "31–60": "bg-warning",
  "61–90": "bg-warning",
  "90+": "bg-destructive",
};
const BUCKET_ACCENT: Record<string, string> = {
  "Current": "text-primary",
  "1–30": "text-info",
  "31–60": "text-warning",
  "61–90": "text-warning",
  "90+": "text-destructive",
};
const BUCKET_TINT: Record<string, string> = {
  "Current": "bg-primary/10",
  "1–30": "bg-info/10",
  "31–60": "bg-warning/10",
  "61–90": "bg-warning/10",
  "90+": "bg-destructive/10",
};

// Per-invoice aging chip (based on days since invoice date).
function invoiceAgingBucket(ageDays: number): { label: string; tone: "muted" | "warning" | "destructive" } {
  if (ageDays <= 0) return { label: "Current", tone: "muted" };
  if (ageDays <= 30) return { label: "1–30d", tone: "muted" };
  if (ageDays <= 60) return { label: "31–60d", tone: "warning" };
  return { label: "60d+", tone: "destructive" };
}
const AGING_TONE: Record<"muted" | "warning" | "destructive", string> = {
  muted: "bg-muted text-muted-foreground",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export default function Payables() {
  const {
    invoices, payrollPayables, creditNotes, creditNotesAvailable, appliedCreditThisMonth,
    payments, paidThisMonth, awaitingBankMatchCount, bankAccounts, loading, refresh,
  } = usePayables();

  const [tab, setTab] = useState("open");

  // Dialogs
  const [recordOpen, setRecordOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [active, setActive] = useState<APInvoice | null>(null);

  const openRecord = (inv: APInvoice) => { setActive(inv); setRecordOpen(true); };
  const openAllocate = (inv: APInvoice) => { setActive(inv); setAllocateOpen(true); };
  const openHistory = (inv: APInvoice) => { setActive(inv); setHistoryOpen(true); };

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((i) => map.set(i.supplier_id, i.supplier_name));
    creditNotes.forEach((c) => map.set(c.supplier_id, c.supplier_name));
    payments.forEach((p) => p.supplier_id && map.set(p.supplier_id, p.supplier_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices, creditNotes, payments]);

  const venues = useMemo(
    () => Array.from(new Set([
      ...invoices.map((i) => i.venue).filter(Boolean),
      ...creditNotes.map((c) => c.venue || "").filter(Boolean),
    ])).sort(),
    [invoices, creditNotes]
  );

  const applyCreditFromCN = (cn: APCreditNote) => {
    // Open RecordPaymentDialog scoped to this supplier; pick the largest open invoice as anchor
    const inv = invoices
      .filter((i) => i.supplier_id === cn.supplier_id && i.outstanding_amount > 0.01 && i.payment_status !== "voided")
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount)[0];
    if (!inv) return;
    openRecord(inv);
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Accounts Payable</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track supplier obligations and manage payments with clarity and control.
            </p>
          </div>
        </div>
      </header>


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">Open Payables</TabsTrigger>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
          <TabsTrigger value="aging">Aging Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4 space-y-4">
          <OpenPayablesTab
            invoices={invoices}
            suppliers={suppliers}
            venues={venues}
            bankAccounts={bankAccounts}
            payrollPayables={payrollPayables}
            paidThisMonth={paidThisMonth}
            awaitingBankMatchCount={awaitingBankMatchCount}
            creditNotesAvailable={creditNotesAvailable}
            loading={loading}
            onRecord={openRecord}
            onAllocate={openAllocate}
            onHistory={openHistory}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <PaymentHistoryTab
            payments={payments}
            suppliers={suppliers}
            bankAccounts={bankAccounts}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="credit-notes" className="mt-4 space-y-4">
          <CreditNotesTab
            creditNotes={creditNotes}
            appliedThisMonth={appliedCreditThisMonth}
            suppliers={suppliers}
            venues={venues}
            invoices={invoices}
            loading={loading}
            onApply={applyCreditFromCN}
            onSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="aging" className="mt-4 space-y-4">
          <AgingTab invoices={invoices} suppliers={suppliers} venues={venues} loading={loading} />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={recordOpen} onOpenChange={setRecordOpen}
        invoice={active} supplierInvoices={invoices} bankAccounts={bankAccounts}
        creditNotes={creditNotesAvailable} onSaved={refresh}
      />
      <AllocatePaymentDialog
        open={allocateOpen} onOpenChange={setAllocateOpen}
        invoice={active} onSaved={refresh}
      />
      <PaymentHistoryDialog
        open={historyOpen} onOpenChange={setHistoryOpen}
        invoice={active} onChanged={refresh}
      />
    </div>
  );
}

/* ============================== OPEN PAYABLES ============================== */

function OpenPayablesTab({
  invoices, suppliers, venues, bankAccounts, payrollPayables,
  paidThisMonth, awaitingBankMatchCount, creditNotesAvailable, loading,
  onRecord, onAllocate, onHistory,
}: any) {
  const [search, setSearch] = useState("");
  const [supplierF, setSupplierF] = useState("all");
  const [venueF, setVenueF] = useState("all");
  const [paymentStatusF, setPaymentStatusF] = useState("all");
  const [bankMatchF, setBankMatchF] = useState("all");
  const [dueRange, setDueRange] = useState<DueRange>("all");
  const [paidFromF, setPaidFromF] = useState("all");

  const filtered = useMemo(() => {
    const today = todayStr();
    const inDays = (d: string | null, days: number) => {
      if (!d) return false;
      const diff = (new Date(d).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= days;
    };
    return (invoices as APInvoice[]).filter((i) => {
      if (i.payment_status === "voided") return false;
      if (i.outstanding_amount <= 0.01 && i.payment_status === "paid") {
        // keep paid w/ 0 outstanding out of "open"
        return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!i.supplier_name.toLowerCase().includes(s) && !i.invoice_number.toLowerCase().includes(s)) return false;
      }
      if (supplierF !== "all" && i.supplier_id !== supplierF) return false;
      if (venueF !== "all" && i.venue !== venueF) return false;
      if (paymentStatusF !== "all" && i.payment_status !== paymentStatusF) return false;
      if (bankMatchF !== "all" && i.bank_match_status !== bankMatchF) return false;
      if (paidFromF !== "all" && i.last_paid_from_account_id !== paidFromF) return false;
      if (dueRange !== "all") {
        if (dueRange === "overdue" && !(i.due_date && i.due_date < today && i.outstanding_amount > 0)) return false;
        if (dueRange === "this_week" && !inDays(i.due_date, 7)) return false;
        if (dueRange === "this_month") {
          if (!i.due_date) return false;
          const d = new Date(i.due_date);
          const now = new Date();
          if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
        }
        if (dueRange === "next_30" && !inDays(i.due_date, 30)) return false;
      }
      return true;
    });
  }, [invoices, search, supplierF, venueF, paymentStatusF, bankMatchF, dueRange, paidFromF]);

  const kpis = useMemo(() => {
    const today = todayStr();
    const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAheadStr = weekAhead.toISOString().slice(0, 10);
    let totalOutstanding = 0, dueIn7 = 0, dueIn7Count = 0;
    let overdueAmt = 0, overdueCount = 0;
    let openCount = 0;
    for (const i of filtered) {
      totalOutstanding += i.outstanding_amount;
      openCount += 1;
      if (i.due_date && i.due_date >= today && i.due_date <= weekAheadStr) {
        dueIn7 += i.outstanding_amount; dueIn7Count += 1;
      }
      if (i.due_date && i.due_date < today && i.outstanding_amount > 0) {
        overdueAmt += i.outstanding_amount; overdueCount += 1;
      }
    }
    const cnTotal = (creditNotesAvailable as APCreditNote[]).reduce((s, c) => s + c.remaining_balance, 0);
    return { totalOutstanding, openCount, dueIn7, dueIn7Count, overdueAmt, overdueCount, cnTotal, cnCount: creditNotesAvailable.length };
  }, [filtered, creditNotesAvailable]);

  const resetFilters = () => {
    setSearch(""); setSupplierF("all"); setVenueF("all");
    setPaymentStatusF("all"); setBankMatchF("all"); setDueRange("all"); setPaidFromF("all");
  };

  const exportCSV = () => {
    downloadCSV(
      filtered.map((i: APInvoice) => ({
        supplier: i.supplier_name,
        invoice_number: i.invoice_number,
        venue: i.venue,
        invoice_date: i.invoice_date,
        due_date: i.due_date || "",
        invoice_amount: i.total_amount.toFixed(2),
        outstanding: i.outstanding_amount.toFixed(2),
        payment_status: paymentStatusLabel(i.payment_status),
        last_payment_method: i.last_payment_method || "",
        paid_from: i.last_paid_from_account_name || "",
        bank_match: bankMatchLabel(i.bank_match_status),
        issue: i.exception_note || "",
      })),
      [
        { key: "supplier", label: "Supplier" },
        { key: "invoice_number", label: "Invoice #" },
        { key: "venue", label: "Venue" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "due_date", label: "Due Date" },
        { key: "invoice_amount", label: "Invoice Amount" },
        { key: "outstanding", label: "Outstanding Amount" },
        { key: "payment_status", label: "Payment Status" },
        { key: "last_payment_method", label: "Last Payment Method" },
        { key: "paid_from", label: "Paid From Account" },
        { key: "bank_match", label: "Bank Match Status" },
        { key: "issue", label: "Issue" },
      ],
      "accounts_payable"
    );
  };

  return (
    <>
      <KPIGrid cols={6}>
        <KPI icon={<Wallet className="h-4 w-4" />} label="Total Outstanding" value={`HK$ ${fmtWhole(kpis.totalOutstanding)}`} sub={`Across ${kpis.openCount} invoices`} accent={kpis.totalOutstanding > 0 ? "text-destructive" : ""} tint={kpis.totalOutstanding > 0 ? "bg-destructive/10" : "bg-muted"} />
        <KPI icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={`HK$ ${fmtWhole(kpis.overdueAmt)}`} sub={`${kpis.overdueCount} invoices`} accent="text-destructive" tint="bg-destructive/10" />
        <KPI icon={<CalendarClock className="h-4 w-4" />} label="Due in 7 Days" value={`HK$ ${fmtWhole(kpis.dueIn7)}`} sub={`${kpis.dueIn7Count} invoices`} accent="text-warning" tint="bg-warning/10" />
        <KPI icon={<CheckCircle2 className="h-4 w-4" />} label="Paid This Month" value={`HK$ ${fmtWhole(paidThisMonth)}`} accent="text-primary" tint="bg-primary/10" />
        <KPI icon={<Link2 className="h-4 w-4" />} label="Awaiting Bank Match" value={`${awaitingBankMatchCount}`} sub={`${awaitingBankMatchCount} payments`} accent="text-info" tint="bg-info/10" />
        <KPI icon={<Coins className="h-4 w-4" />} label="Credit Notes Available" value={`HK$ ${fmtWhole(kpis.cnTotal)}`} sub={`${kpis.cnCount} credit notes`} accent="text-info" tint="bg-info/10" />
      </KPIGrid>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search supplier or invoice #…" />
        <FilterSelect label="Supplier" value={supplierF} onChange={setSupplierF} options={[["all", "All Suppliers"], ...suppliers]} />
        <FilterSelect label="Venue" value={venueF} onChange={setVenueF} options={[["all", "All Venues"], ...venues.map((v: string) => [v, v] as [string, string])]} />
        <FilterSelect label="Status" value={paymentStatusF} onChange={setPaymentStatusF} options={[["all", "All Statuses"], ...PAYMENT_STATUS_OPTIONS.map((s) => [s, paymentStatusLabel(s)] as [string, string])]} />
        <FilterSelect label="Bank Match" value={bankMatchF} onChange={setBankMatchF} options={[["all", "Any Match"], ...BANK_MATCH_OPTIONS.map((s) => [s, bankMatchLabel(s)] as [string, string])]} />
        <FilterSelect label="Due" value={dueRange} onChange={(v) => setDueRange(v as DueRange)} options={[
          ["all", "Any Due"], ["overdue", "Overdue"], ["this_week", "Due This Week"],
          ["this_month", "Due This Month"], ["next_30", "Next 30 Days"],
        ]} />
        <FilterSelect label="Paid From" value={paidFromF} onChange={setPaidFromF} options={[
          ["all", "Any Account"],
          ...bankAccounts.map((b: any) => [b.id, `${b.bank_name || b.account_name}${b.account_number_last4 ? ` •••${b.account_number_last4}` : ""}`] as [string, string]),
        ]} />
        <Button size="sm" variant="ghost" onClick={resetFilters} className="ml-auto">Clear</Button>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export</Button>
      </FilterBar>

      <Card className="card-glass overflow-hidden">
        <SectionTitle title={`Open Payables (${filtered.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <Th>Supplier</Th><Th>Invoice #</Th><Th>Venue</Th>
                <Th>Invoice Date</Th><Th>Due Date</Th><Th>Age</Th>
                <Th right>Invoice Amt</Th><Th right>Outstanding</Th>
                <Th>Payment Status</Th><Th>Last Method</Th><Th>Paid From</Th>
                <Th>Bank Match</Th><Th>Issue</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 14 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-muted/30 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">No open payables match the current filters.</td></tr>
              ) : filtered.slice(0, 500).map((i: APInvoice) => {
                const ag = invoiceAgingBucket(i.age_days);
                return (
                <tr key={i.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs font-medium">{i.supplier_name}</td>
                  <td className="px-3 py-2 text-xs font-mono">{i.invoice_number || "—"}</td>
                  <td className="px-3 py-2 text-xs">{i.venue}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(i.invoice_date)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(i.due_date)}</td>
                  <td className="px-3 py-2"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${AGING_TONE[ag.tone]}`}>{ag.label}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(i.total_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold">{fmt(i.outstanding_amount)}</td>
                  <td className="px-3 py-2"><PaymentStatusBadge status={i.payment_status} /></td>
                  <td className="px-3 py-2 text-xs">{i.last_payment_method || "—"}</td>
                  <td className="px-3 py-2 text-xs">{i.last_paid_from_account_name || "—"}</td>
                  <td className="px-3 py-2"><BankMatchBadge status={i.bank_match_status} /></td>
                  <td className="px-3 py-2 text-xs text-warning">{i.exception_note || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {i.outstanding_amount > 0.01 && (
                        <Button size="sm" variant="default" className="h-7 text-[11px]" onClick={() => onRecord(i)}>
                          Record Payment
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => onRecord(i)}>Record Payment</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onAllocate(i)}>Allocate to Bank</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onHistory(i)}>View Payment History</DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/procurement/invoices" className="flex items-center gap-2">
                              <ExternalLink className="h-3.5 w-3.5" /> Open Invoice
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t">
              Showing first 500 of {filtered.length}. Narrow filters to see more.
            </div>
          )}
        </div>
      </Card>

      {payrollPayables.length > 0 && (
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold">Payroll Liabilities</h3>
              <p className="text-xs text-muted-foreground">Outstanding amounts owed to staff and the MPF trustee (from the General Ledger).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {payrollPayables.map((p: any) => (
              <div key={p.account_code} className="flex items-center justify-between border border-border/40 rounded-lg px-3 py-2 bg-muted/20">
                <div>
                  <div className="text-sm font-medium">{p.account_name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.account_code}</div>
                </div>
                <div className="font-mono tabular-nums text-base font-semibold">{fmt(p.outstanding)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ============================== PAYMENT HISTORY ============================== */

function PaymentHistoryTab({ payments, suppliers, bankAccounts, loading }: any) {
  const [search, setSearch] = useState("");
  const [supplierF, setSupplierF] = useState("all");
  const [methodF, setMethodF] = useState("all");
  const [paidFromF, setPaidFromF] = useState("all");
  const [matchF, setMatchF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const methods = useMemo(
    () => Array.from(new Set((payments as any[]).map((p) => p.payment_method).filter(Boolean))).sort(),
    [payments]
  );

  const filtered = useMemo(() => {
    return (payments as any[]).filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        const hay = [p.supplier_name, p.reference_number, p.cheque_number, p.id, ...(p.invoice_numbers || [])].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (supplierF !== "all" && p.supplier_id !== supplierF) return false;
      if (methodF !== "all" && p.payment_method !== methodF) return false;
      if (paidFromF !== "all" && p.paid_from_account_id !== paidFromF) return false;
      if (matchF !== "all" && p.match_status !== matchF) return false;
      if (from && p.payment_date < from) return false;
      if (to && p.payment_date > to) return false;
      return true;
    });
  }, [payments, search, supplierF, methodF, paidFromF, matchF, from, to]);

  const kpis = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);
    let paidMonth = 0, paidMonthCount = 0;
    let awaiting = 0, matched = 0, partial = 0, unalloc = 0;
    for (const p of filtered) {
      if (p.payment_date >= ms) { paidMonth += p.amount; paidMonthCount += 1; }
      if (["awaiting_bank_match", "possible_match", "needs_review"].includes(p.match_status)) awaiting += 1;
      if (p.match_status === "matched") matched += 1;
      if (p.allocated_amount > 0 && p.unallocated_amount > 0.01) partial += 1;
      if (p.allocated_amount === 0 && p.credit_applied === 0) unalloc += 1;
    }
    return { paidMonth, paidMonthCount, awaiting, matched, partial, unalloc };
  }, [filtered]);

  const exportCSV = () => {
    downloadCSV(
      filtered.map((p: any) => ({
        date: p.payment_date,
        ref: p.reference_number || p.id.slice(0, 8),
        supplier: p.supplier_name,
        paid_from: p.paid_from_account_name || "",
        method: p.payment_method,
        amount: p.amount.toFixed(2),
        allocated: p.allocated_amount.toFixed(2),
        credit: p.credit_applied.toFixed(2),
        unallocated: p.unallocated_amount.toFixed(2),
        bank_match: bankMatchLabel(p.match_status),
        invoices: (p.invoice_numbers || []).join("; "),
      })),
      [
        { key: "date", label: "Payment Date" },
        { key: "ref", label: "Payment Ref" },
        { key: "supplier", label: "Supplier" },
        { key: "paid_from", label: "Paid From" },
        { key: "method", label: "Method" },
        { key: "amount", label: "Total Amount" },
        { key: "allocated", label: "Allocated" },
        { key: "credit", label: "Credit Applied" },
        { key: "unallocated", label: "Unallocated" },
        { key: "bank_match", label: "Bank Match" },
        { key: "invoices", label: "Invoices" },
      ],
      "payment_history"
    );
  };

  return (
    <>
      <KPIGrid cols={5}>
        <KPI icon={<CheckCircle2 className="h-4 w-4" />} label="Total Paid This Month" value={`HK$ ${fmtWhole(kpis.paidMonth)}`} sub={`${kpis.paidMonthCount} payments`} accent="text-primary" tint="bg-primary/10" />
        <KPI icon={<Hourglass className="h-4 w-4" />} label="Payments Awaiting Match" value={`${kpis.awaiting}`} sub={`${kpis.awaiting} payments`} accent="text-warning" tint="bg-warning/10" />
        <KPI icon={<Link2 className="h-4 w-4" />} label="Matched Payments" value={`${kpis.matched}`} sub={`${kpis.matched} payments`} accent="text-info" tint="bg-info/10" />
        <KPI icon={<PieChart className="h-4 w-4" />} label="Partial Allocations" value={`${kpis.partial}`} sub={`${kpis.partial} payments`} accent="text-warning" tint="bg-warning/10" />
        <KPI icon={<FileWarning className="h-4 w-4" />} label="Unallocated Payments" value={`${kpis.unalloc}`} sub={`${kpis.unalloc} payments`} accent="text-destructive" tint="bg-destructive/10" />
      </KPIGrid>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers or payments…" />
        <FilterSelect label="Supplier" value={supplierF} onChange={setSupplierF} options={[["all", "All Suppliers"], ...suppliers]} />
        <FilterSelect label="Method" value={methodF} onChange={setMethodF} options={[["all", "All Payment Methods"], ...methods.map((m: string) => [m, m] as [string, string])]} />
        <FilterSelect label="Paid From" value={paidFromF} onChange={setPaidFromF} options={[
          ["all", "All Paid From Accounts"],
          ...bankAccounts.map((b: any) => [b.id, `${b.bank_name || b.account_name}${b.account_number_last4 ? ` •••${b.account_number_last4}` : ""}`] as [string, string]),
        ]} />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <FilterSelect label="Bank Match" value={matchF} onChange={setMatchF} options={[["all", "All Bank Match Status"], ...BANK_MATCH_OPTIONS.map((s) => [s, bankMatchLabel(s)] as [string, string])]} />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setSearch(""); setSupplierF("all"); setMethodF("all"); setPaidFromF("all"); setMatchF("all"); setFrom(""); setTo(""); }}>Clear</Button>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export</Button>
      </FilterBar>

      <Card className="card-glass overflow-hidden">
        <SectionTitle title={`Payment History (${filtered.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <Th>Payment Date</Th><Th>Payment Ref</Th><Th>Supplier</Th>
                <Th>Paid From</Th><Th>Method</Th>
                <Th right>Total Amount</Th><Th right>Allocated</Th><Th right>Unallocated</Th>
                <Th>Bank Match</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-muted/30 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No payments recorded yet.</td></tr>
              ) : filtered.slice(0, 500).map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                  <td className="px-3 py-2 text-xs font-mono">{p.reference_number || `PAY-${p.id.slice(0, 6).toUpperCase()}`}</td>
                  <td className="px-3 py-2 text-xs font-medium">{p.supplier_name}</td>
                  <td className="px-3 py-2 text-xs">{p.paid_from_account_name || "—"}</td>
                  <td className="px-3 py-2 text-xs">{p.payment_method}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(p.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(p.allocated_amount)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums text-xs ${p.unallocated_amount > 0.01 ? "text-warning" : ""}`}>{fmt(p.unallocated_amount)}</td>
                  <td className="px-3 py-2"><BankMatchBadge status={p.match_status} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={p.allocation_count === 0}>View Allocation</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t">
              Showing first 500 of {filtered.length}.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

/* ============================== CREDIT NOTES ============================== */

function CreditNotesTab({ creditNotes, appliedThisMonth, suppliers, venues, invoices, loading, onApply, onSaved }: any) {
  const [bookOpen, setBookOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [supplierF, setSupplierF] = useState("all");
  const [venueF, setVenueF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return (creditNotes as APCreditNote[]).filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        const hay = [c.supplier_name, c.credit_note_number, c.source_invoice_number || ""].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (supplierF !== "all" && c.supplier_id !== supplierF) return false;
      if (venueF !== "all" && (c.venue || "") !== venueF) return false;
      if (statusF !== "all" && c.status !== statusF) return false;
      if (from && c.credit_note_date < from) return false;
      if (to && c.credit_note_date > to) return false;
      return true;
    });
  }, [creditNotes, search, supplierF, venueF, statusF, from, to]);

  const kpis = useMemo(() => {
    let available = 0, availableCount = 0;
    let unused = 0;
    let fullyApplied = 0;
    let needsReview = 0;
    for (const c of filtered) {
      if (c.status === "approved" && c.remaining_balance > 0.01) { available += c.remaining_balance; availableCount += 1; }
      if (c.status !== "fully_applied" && c.status !== "voided") unused += c.remaining_balance;
      if (c.status === "fully_applied") fullyApplied += 1;
      if (c.status === "needs_review" || c.status === "draft") needsReview += 1;
    }
    return { available, availableCount, unused, fullyApplied, needsReview };
  }, [filtered]);

  const statusBadge = (s: string) => {
    const meta: Record<string, { l: string; c: string; d: string }> = {
      approved: { l: "Available", c: "bg-info/10 text-info border-info/30", d: "bg-info" },
      fully_applied: { l: "Fully Applied", c: "bg-primary/10 text-primary border-primary/25", d: "bg-primary" },
      partially_applied: { l: "Partially Applied", c: "bg-warning/10 text-warning border-warning/30", d: "bg-warning" },
      draft: { l: "Draft", c: "bg-muted text-muted-foreground border-border", d: "bg-muted-foreground/60" },
      needs_review: { l: "Needs Review", c: "bg-destructive/10 text-destructive border-destructive/25", d: "bg-destructive" },
      voided: { l: "Voided", c: "bg-muted text-muted-foreground border-border line-through", d: "bg-muted-foreground/60" },
      expired: { l: "Expired", c: "bg-destructive/10 text-destructive border-destructive/25", d: "bg-destructive" },
    };
    const m = meta[s] || { l: s, c: "bg-muted text-muted-foreground border-border", d: "bg-muted-foreground/60" };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${m.c}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${m.d}`} />
        {m.l}
      </span>
    );
  };

  const exportCSV = () => {
    downloadCSV(
      filtered.map((c) => ({
        date: c.credit_note_date,
        cn_number: c.credit_note_number,
        supplier: c.supplier_name,
        venue: c.venue || "",
        original: c.original_amount.toFixed(2),
        applied: c.applied_amount.toFixed(2),
        remaining: c.remaining_balance.toFixed(2),
        status: c.status,
        linked_invoice: c.source_invoice_number || "",
      })),
      [
        { key: "date", label: "Credit Note Date" },
        { key: "cn_number", label: "Credit Note #" },
        { key: "supplier", label: "Supplier" },
        { key: "venue", label: "Venue" },
        { key: "original", label: "Original Amount" },
        { key: "applied", label: "Applied Amount" },
        { key: "remaining", label: "Remaining Balance" },
        { key: "status", label: "Status" },
        { key: "linked_invoice", label: "Linked Invoice" },
      ],
      "credit_notes"
    );
  };

  return (
    <>
      <KPIGrid cols={5}>
        <KPI icon={<Coins className="h-4 w-4" />} label="Available Credit Notes" value={`HK$ ${fmtWhole(kpis.available)}`} sub={`${kpis.availableCount} credit notes`} accent="text-info" tint="bg-info/10" />
        <KPI icon={<CheckCircle2 className="h-4 w-4" />} label="Applied This Month" value={`HK$ ${fmtWhole(appliedThisMonth)}`} accent="text-primary" tint="bg-primary/10" />
        <KPI icon={<Banknote className="h-4 w-4" />} label="Unused Balance" value={`HK$ ${fmtWhole(kpis.unused)}`} accent="text-info" tint="bg-info/10" />
        <KPI icon={<ListChecks className="h-4 w-4" />} label="Fully Applied" value={`${kpis.fullyApplied}`} sub={`${kpis.fullyApplied} credit notes`} accent="text-primary" tint="bg-primary/10" />
        <KPI icon={<FileWarning className="h-4 w-4" />} label="Needs Review" value={`${kpis.needsReview}`} sub={`${kpis.needsReview} credit notes`} accent="text-destructive" tint="bg-destructive/10" />
      </KPIGrid>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers or credit notes…" />
        <FilterSelect label="Supplier" value={supplierF} onChange={setSupplierF} options={[["all", "All Suppliers"], ...suppliers]} />
        <FilterSelect label="Venue" value={venueF} onChange={setVenueF} options={[["all", "All Venues"], ...venues.map((v: string) => [v, v] as [string, string])]} />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={[
          ["all", "All Statuses"],
          ["approved", "Available"],
          ["partially_applied", "Partially Applied"],
          ["fully_applied", "Fully Applied"],
          ["needs_review", "Needs Review"],
          ["draft", "Draft"],
          ["voided", "Voided"],
        ]} />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setSearch(""); setSupplierF("all"); setVenueF("all"); setStatusF("all"); setFrom(""); setTo(""); }}>Clear</Button>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export</Button>
        <Button size="sm" variant="default" onClick={() => setBookOpen(true)}><Plus className="h-4 w-4 mr-1" /> Book Credit Note</Button>
      </FilterBar>

      <Card className="card-glass overflow-hidden">
        <SectionTitle title={`Credit Notes (${filtered.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <Th>Credit Note Date</Th><Th>Credit Note #</Th><Th>Supplier</Th><Th>Venue</Th>
                <Th right>Original</Th><Th right>Applied</Th><Th right>Remaining</Th>
                <Th>Status</Th><Th>Linked Invoice</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-muted/30 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No credit notes match the current filters.</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(c.credit_note_date)}</td>
                  <td className="px-3 py-2 text-xs font-mono">{c.credit_note_number || "—"}</td>
                  <td className="px-3 py-2 text-xs font-medium">{c.supplier_name}</td>
                  <td className="px-3 py-2 text-xs">{c.venue || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">{fmt(c.original_amount)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">{fmt(c.applied_amount)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs font-semibold">{fmt(c.remaining_balance)}</td>
                  <td className="px-3 py-2">{statusBadge(c.status)}</td>
                  <td className="px-3 py-2 text-xs">{c.source_invoice_number || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {c.status === "approved" && c.remaining_balance > 0.01 ? (
                      <Button size="sm" variant="default" className="h-7 text-[11px]" onClick={() => onApply(c)}>Apply</Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled>View</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <BookCreditNoteDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        suppliers={suppliers}
        venues={venues}
        invoices={invoices}
        onSaved={onSaved}
      />
    </>
  );
}

/* ============================== AGING SUMMARY ============================== */

function AgingTab({ invoices, suppliers, venues, loading }: any) {
  const [search, setSearch] = useState("");
  const [supplierF, setSupplierF] = useState("all");
  const [venueF, setVenueF] = useState("all");
  const [bucketF, setBucketF] = useState("all");

  const open = useMemo(
    () => (invoices as APInvoice[]).filter((i) => i.outstanding_amount > 0.01 && i.payment_status !== "voided"),
    [invoices]
  );

  const filteredInv = useMemo(() => {
    return open.filter((i) => {
      if (search && !i.supplier_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (supplierF !== "all" && i.supplier_id !== supplierF) return false;
      if (venueF !== "all" && i.venue !== venueF) return false;
      if (bucketF !== "all" && i.bucket !== bucketF) return false;
      return true;
    });
  }, [open, search, supplierF, venueF, bucketF]);

  const bucketTotals = useMemo(() => {
    const t: Record<string, number> = {};
    AGE_BUCKETS.forEach((b) => (t[b] = 0));
    let grand = 0;
    for (const i of filteredInv) {
      t[i.bucket] = (t[i.bucket] || 0) + i.outstanding_amount;
      grand += i.outstanding_amount;
    }
    return { totals: t, grand };
  }, [filteredInv]);

  const supplierRows = useMemo(() => {
    const map = new Map<string, { supplier_id: string; supplier_name: string; buckets: Record<string, number>; total: number }>();
    for (const i of filteredInv) {
      const cur = map.get(i.supplier_id) || { supplier_id: i.supplier_id, supplier_name: i.supplier_name, buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])), total: 0 };
      cur.buckets[i.bucket] = (cur.buckets[i.bucket] || 0) + i.outstanding_amount;
      cur.total += i.outstanding_amount;
      map.set(i.supplier_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredInv]);

  const grand = bucketTotals.grand || 1;

  return (
    <>
      <KPIGrid cols={6}>
        <KPI icon={<Wallet className="h-4 w-4" />} label="Total Outstanding" value={`HK$ ${fmtWhole(bucketTotals.grand)}`} sub={`Across ${filteredInv.length} invoices`} />
        {AGE_BUCKETS.map((b) => {
          const v = bucketTotals.totals[b] || 0;
          const pct = bucketTotals.grand > 0 ? (v / bucketTotals.grand) * 100 : 0;
          return (
            <KPI
              key={b}
              icon={b === "Current" ? <CheckCircle2 className="h-4 w-4" /> : b === "90+" ? <AlertTriangle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
              label={b === "Current" ? "Current (0–30 Days)" : `${b} Days`}
              value={`HK$ ${fmtWhole(v)}`}
              sub={`${pct.toFixed(1)}%`}
              accent={BUCKET_ACCENT[b]}
              tint={BUCKET_TINT[b]}
            />
          );
        })}
      </KPIGrid>

      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Aging Overview</h3>
          <Link to="/finance/trial-balance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View aging report <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
          {AGE_BUCKETS.map((b) => {
            const w = ((bucketTotals.totals[b] || 0) / grand) * 100;
            return <div key={b} className={`${BUCKET_COLOR[b]}`} style={{ width: `${w}%` }} title={`${b}: ${fmt(bucketTotals.totals[b] || 0)}`} />;
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {AGE_BUCKETS.map((b) => {
            const v = bucketTotals.totals[b] || 0;
            const pct = bucketTotals.grand > 0 ? (v / bucketTotals.grand) * 100 : 0;
            return (
              <div key={b} className="rounded-lg border border-border/40 px-3 py-2 bg-muted/10">
                <div className={`text-[10px] uppercase tracking-wide ${BUCKET_ACCENT[b]}`}>{b === "Current" ? "Current (0–30 Days)" : `${b} Days`}</div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className={`font-mono tabular-nums text-base font-semibold ${BUCKET_ACCENT[b]}`}>HK$ {fmt(v)}</div>
                  <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers…" />
        <FilterSelect label="Supplier" value={supplierF} onChange={setSupplierF} options={[["all", "All Suppliers"], ...suppliers]} />
        <FilterSelect label="Venue" value={venueF} onChange={setVenueF} options={[["all", "All Venues"], ...venues.map((v: string) => [v, v] as [string, string])]} />
        <FilterSelect label="Bucket" value={bucketF} onChange={setBucketF} options={[["all", "Aging Bucket: All"], ...AGE_BUCKETS.map((b) => [b, b] as [string, string])]} />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setSearch(""); setSupplierF("all"); setVenueF("all"); setBucketF("all"); }}>Clear</Button>
      </FilterBar>

      <Card className="card-glass overflow-hidden">
        <SectionTitle title="Aging Summary" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <Th>Supplier</Th>
                {AGE_BUCKETS.map((b) => <Th key={b} right>{b === "Current" ? "Current (0–30 Days)" : `${b} Days`}</Th>)}
                <Th right>Total Outstanding</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: AGE_BUCKETS.length + 3 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-muted/30 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : supplierRows.length === 0 ? (
                <tr><td colSpan={AGE_BUCKETS.length + 3} className="px-4 py-8 text-center text-muted-foreground">All clear — no outstanding payables.</td></tr>
              ) : supplierRows.map((r) => (
                <tr key={r.supplier_id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs font-medium">{r.supplier_name}</td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b} className={`px-3 py-2 text-right font-mono tabular-nums text-xs ${BUCKET_ACCENT[b]}`}>
                      {(r.buckets[b] || 0) > 0 ? fmt(r.buckets[b] || 0) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs font-semibold">{fmt(r.total)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setSupplierF(r.supplier_id); }}>Open Invoices</Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {supplierRows.length > 0 && (
              <tfoot className="bg-muted/40 font-semibold border-t-2 border-border/60">
                <tr>
                  <td className="px-3 py-2 text-xs">Total</td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b} className="px-3 py-2 text-right font-mono tabular-nums text-xs">{fmt(bucketTotals.totals[b] || 0)}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">{fmt(bucketTotals.grand)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </>
  );
}

/* ============================== SHARED UI ============================== */

function KPIGrid({ children, cols }: { children: React.ReactNode; cols: number }) {
  const map: Record<number, string> = {
    5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
    6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  };
  return <div className={`grid ${map[cols] || map[5]} gap-3`}>{children}</div>;
}

function KPI({
  label, value, sub, accent = "", tint = "bg-muted/30", icon,
}: { label: string; value: string; sub?: string; accent?: string; tint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="card-glass p-4 min-w-0 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</div>
        {icon && (
          <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${tint} ${accent}`}>
            {icon}
          </div>
        )}
      </div>
      <div className={`font-bold font-mono tabular-nums mt-2 whitespace-nowrap min-w-0 ${kpiValueSizeClass(value)} ${accent}`} title={typeof value === "string" ? value : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
    </Card>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <Card className="card-glass p-3">
      <div className="flex flex-wrap gap-2 items-center">{children}</div>
    </Card>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[220px] max-w-xs">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9 h-9 text-xs" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="h-9 w-[140px] text-xs" />
      <span className="text-muted-foreground text-xs">to</span>
      <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="h-9 w-[140px] text-xs" />
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-border/40">
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.filter(([v]) => v !== "").map(([v, l]) => (
          <SelectItem key={v} value={v}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
