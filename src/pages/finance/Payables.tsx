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
  CreditCard, Download, RefreshCw, Search, ExternalLink, MoreHorizontal,
  Wallet, CalendarClock, AlertTriangle, CheckCircle2, Layers, Link2, Coins,
} from "lucide-react";
import { Link } from "react-router-dom";
import { usePayables, type APInvoice } from "@/hooks/usePayables";
import { AGE_BUCKETS } from "@/hooks/useReceivables";
import { AgingMatrix } from "@/components/finance/AgingMatrix";
import { downloadCSV } from "@/utils/csvDownload";
import {
  PaymentStatusBadge, BankMatchBadge,
  PAYMENT_STATUS_OPTIONS, BANK_MATCH_OPTIONS, paymentStatusLabel, bankMatchLabel,
} from "@/components/finance/payables/StatusBadges";
import { RecordPaymentDialog } from "@/components/finance/payables/RecordPaymentDialog";
import { AllocatePaymentDialog } from "@/components/finance/payables/AllocatePaymentDialog";
import { PaymentHistoryDialog } from "@/components/finance/payables/PaymentHistoryDialog";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);

type DueRange = "all" | "overdue" | "this_week" | "this_month" | "next_30";

export default function Payables() {
  const {
    invoices, supplierSummary, paidThisMonth, awaitingBankMatchCount, unallocatedPaymentsCount,
    bankAccounts, payrollPayables, creditNotes, loading, refresh,
  } = usePayables();

  // Filters
  const [search, setSearch] = useState("");
  const [supplierF, setSupplierF] = useState("all");
  const [venueF, setVenueF] = useState("all");
  const [paymentStatusF, setPaymentStatusF] = useState<string>("all");
  const [bankMatchF, setBankMatchF] = useState<string>("all");
  const [dueRange, setDueRange] = useState<DueRange>("all");
  const [paidFromF, setPaidFromF] = useState<string>("all");

  // Dialogs
  const [recordOpen, setRecordOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [active, setActive] = useState<APInvoice | null>(null);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((i) => map.set(i.supplier_id, i.supplier_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices]);
  const venues = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.venue).filter(Boolean))).sort(),
    [invoices]
  );

  const filtered = useMemo(() => {
    const today = todayStr();
    const inDays = (d: string | null, days: number) => {
      if (!d) return false;
      const diff = (new Date(d).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= days;
    };
    return invoices.filter((i) => {
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
    let totalOutstanding = 0, dueThisWeek = 0, overdueAmt = 0, partial = 0;
    for (const i of filtered) {
      if (i.payment_status === "voided") continue;
      totalOutstanding += i.outstanding_amount;
      if (i.due_date && i.due_date >= today && i.due_date <= weekAheadStr) dueThisWeek += i.outstanding_amount;
      if (i.due_date && i.due_date < today && i.outstanding_amount > 0) overdueAmt += i.outstanding_amount;
      if (i.payment_status === "partially_paid") partial += 1;
    }
    return {
      totalOutstanding,
      dueThisWeek,
      overdue: overdueAmt,
      paidThisMonth,
      partiallyPaid: partial,
      awaitingBankMatch: awaitingBankMatchCount,
      unallocatedPayments: unallocatedPaymentsCount,
    };
  }, [filtered, paidThisMonth, awaitingBankMatchCount, unallocatedPaymentsCount]);

  const agingRows = useMemo(() => {
    const map = new Map<string, { label: string; buckets: Record<string, number>; total: number }>();
    for (const inv of filtered) {
      if (inv.outstanding_amount <= 0) continue;
      const cur = map.get(inv.supplier_id) || { label: inv.supplier_name, buckets: Object.fromEntries(AGE_BUCKETS.map(b => [b, 0])), total: 0 };
      cur.buckets[inv.bucket] = (cur.buckets[inv.bucket] || 0) + inv.outstanding_amount;
      cur.total += inv.outstanding_amount;
      map.set(inv.supplier_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const resetFilters = () => {
    setSearch(""); setSupplierF("all"); setVenueF("all");
    setPaymentStatusF("all"); setBankMatchF("all"); setDueRange("all"); setPaidFromF("all");
  };

  const exportCSV = () => {
    downloadCSV(
      filtered.map((i) => ({
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

  const openRecord = (inv: APInvoice) => { setActive(inv); setRecordOpen(true); };
  const openAllocate = (inv: APInvoice) => { setActive(inv); setAllocateOpen(true); };
  const openHistory = (inv: APInvoice) => { setActive(inv); setHistoryOpen(true); };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Accounts Payable</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Approved invoices only — money owed to suppliers, scheduling, and bank reconciliation.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KPI icon={<Wallet className="h-4 w-4" />} label="Total Outstanding" value={`HK$ ${fmt(kpis.totalOutstanding)}`} />
        <KPI icon={<CalendarClock className="h-4 w-4" />} label="Due This Week" value={`HK$ ${fmt(kpis.dueThisWeek)}`} accent="text-sky-400" />
        <KPI icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={`HK$ ${fmt(kpis.overdue)}`} accent="text-red-400" />
        <KPI icon={<CheckCircle2 className="h-4 w-4" />} label="Paid This Month" value={`HK$ ${fmt(kpis.paidThisMonth)}`} accent="text-emerald-400" />
        <KPI icon={<Layers className="h-4 w-4" />} label="Partially Paid" value={`${kpis.partiallyPaid}`} accent="text-amber-400" />
        <KPI icon={<Link2 className="h-4 w-4" />} label="Awaiting Bank Match" value={`${kpis.awaitingBankMatch}`} accent="text-sky-400" />
        <KPI icon={<Coins className="h-4 w-4" />} label="Unallocated Payments" value={`${kpis.unallocatedPayments}`} accent="text-purple-400" />
      </div>

      {payrollPayables.length > 0 && (
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold">Payroll Liabilities</h3>
              <p className="text-xs text-muted-foreground">Outstanding amounts owed to staff and the MPF trustee (from the General Ledger).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {payrollPayables.map((p) => (
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

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="by-supplier">By Supplier</TabsTrigger>
          <TabsTrigger value="aging">Aging Summary</TabsTrigger>
        </TabsList>

        {/* Invoices view */}
        <TabsContent value="invoices" className="mt-4 space-y-3">
          {/* Filter bar */}
          <Card className="card-glass p-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Search supplier or invoice #…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <FilterSelect label="Supplier" value={supplierF} onChange={setSupplierF} options={[["all", "All Suppliers"], ...suppliers.map(([id, name]) => [id, name] as [string, string])]} />
              <FilterSelect label="Venue" value={venueF} onChange={setVenueF} options={[["all", "All Venues"], ...venues.map((v) => [v, v] as [string, string])]} />
              <FilterSelect label="Payment" value={paymentStatusF} onChange={setPaymentStatusF} options={[["all", "All Statuses"], ...PAYMENT_STATUS_OPTIONS.map((s) => [s, paymentStatusLabel(s)] as [string, string])]} />
              <FilterSelect label="Bank Match" value={bankMatchF} onChange={setBankMatchF} options={[["all", "Any Match"], ...BANK_MATCH_OPTIONS.map((s) => [s, bankMatchLabel(s)] as [string, string])]} />
              <FilterSelect label="Due" value={dueRange} onChange={(v) => setDueRange(v as DueRange)} options={[
                ["all", "Any Due"], ["overdue", "Overdue"], ["this_week", "Due This Week"],
                ["this_month", "Due This Month"], ["next_30", "Next 30 Days"],
              ]} />
              <FilterSelect label="Paid From" value={paidFromF} onChange={setPaidFromF} options={[
                ["all", "Any Account"],
                ...bankAccounts.map((b) => [b.id, `${b.bank_name || b.account_name}${b.account_number_last4 ? ` •••${b.account_number_last4}` : ""}`] as [string, string]),
              ]} />
              <Button size="sm" variant="ghost" onClick={resetFilters}>Reset</Button>
              <div className="ml-auto" />
              <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            </div>
          </Card>

          <Card className="card-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <Th>Supplier</Th><Th>Invoice #</Th><Th>Venue</Th>
                    <Th>Invoice Date</Th><Th>Due Date</Th>
                    <Th right>Invoice Amt</Th><Th right>Outstanding</Th>
                    <Th>Payment Status</Th><Th>Last Method</Th><Th>Paid From</Th>
                    <Th>Bank Match</Th><Th>Issue</Th><Th></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loading ? (
                    <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No invoices match the current filters.</td></tr>
                  ) : filtered.slice(0, 500).map((i) => (
                    <tr key={i.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-medium">{i.supplier_name}</td>
                      <td className="px-3 py-2 text-xs">{i.invoice_number || "—"}</td>
                      <td className="px-3 py-2 text-xs">{i.venue}</td>
                      <td className="px-3 py-2 text-xs font-mono">{i.invoice_date}</td>
                      <td className="px-3 py-2 text-xs font-mono">{i.due_date || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">{fmt(i.total_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-xs font-semibold">{fmt(i.outstanding_amount)}</td>
                      <td className="px-3 py-2"><PaymentStatusBadge status={i.payment_status} /></td>
                      <td className="px-3 py-2 text-xs">{i.last_payment_method || "—"}</td>
                      <td className="px-3 py-2 text-xs">{i.last_paid_from_account_name || "—"}</td>
                      <td className="px-3 py-2"><BankMatchBadge status={i.bank_match_status} /></td>
                      <td className="px-3 py-2 text-xs text-amber-300">{i.exception_note || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {i.outstanding_amount > 0.01 && i.payment_status !== "voided" && (
                            <Button size="sm" variant="default" className="h-7 text-[11px]" onClick={() => openRecord(i)}>
                              Record Payment
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => openRecord(i)}>Record Payment</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openAllocate(i)}>Allocate to Bank</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openHistory(i)}>View Payment History</DropdownMenuItem>
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
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                  Showing first 500 of {filtered.length}. Narrow filters to see more.
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="by-supplier" className="mt-4">
          <Card className="card-glass overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <Th>Supplier</Th><Th right>Open Invoices</Th><Th right>Outstanding</Th>
                  <Th right>Oldest</Th><Th>Last Invoice</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {supplierSummary.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">All clear — no outstanding payables.</td></tr>
                ) : supplierSummary.map((s) => (
                  <tr key={s.supplier_id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{s.supplier_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.open_count}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmt(s.outstanding)}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.oldest_age > 60 ? 'bg-red-500/10 text-red-300' : s.oldest_age > 30 ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{s.oldest_age}d</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.last_invoice_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <AgingMatrix title="AP Aging by Supplier" rows={agingRows} />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={recordOpen} onOpenChange={setRecordOpen}
        invoice={active} supplierInvoices={invoices} bankAccounts={bankAccounts}
        creditNotes={creditNotes} onSaved={refresh}
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

function KPI({ label, value, accent = "", icon }: { label: string; value: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <Card className="card-glass p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono tabular-nums mt-1 truncate ${accent}`}>{value}</div>
    </Card>
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
