import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, AlertTriangle, ArrowUpRight, ArrowDownRight, Receipt, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePayables, type APInvoice } from "@/hooks/usePayables";
import { RecordPaymentDialog } from "@/components/finance/payables/RecordPaymentDialog";
import { PaymentHistoryDialog } from "@/components/finance/payables/PaymentHistoryDialog";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import { SupplierLedgerSheet } from "@/components/procurement/SupplierLedgerSheet";

// ---------- format helpers ----------
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const monthBounds = (y: number, m: number) => {
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10);
  return { start, end };
};

// ---------- KPI card ----------
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
        <div className={`mt-1 text-2xl font-semibold td-num ${toneCls}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">{children}</div>;
}

// ---------- main ----------
export default function ProcurementFinance({ defaultTab = "spend" }: { defaultTab?: string } = {}) {
  const { tenantId } = useActiveTenant();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [venue, setVenue] = useState<string>("all");
  const [venues, setVenues] = useState<string[]>([]);

  const { start: pStart, end: pEnd } = useMemo(() => monthBounds(year, month), [year, month]);
  const { start: pmStart, end: pmEnd } = useMemo(() => monthBounds(year, month - 1), [year, month]);

  // Load distinct venues from GRNs (tenant-scoped)
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const rows = await fetchAllRows("goods_received_notes", "venue", undefined, tenantId);
      const set = new Set<string>();
      for (const r of rows as any[]) if (r.venue) set.add(String(r.venue));
      setVenues(Array.from(set).sort());
    })();
  }, [tenantId]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Procurement Finance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Spend, payables, and credits — one view of supplier-related activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card/40 px-1 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="px-2 text-sm font-medium min-w-[120px] text-center">{MONTHS_LONG[month]} {year}</div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Select value={venue} onValueChange={setVenue}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venues.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0">
          {[
            { v: "spend", l: "Spend Summary" },
            { v: "suppliers", l: "Supplier Accounts" },
            { v: "open-payables", l: "Open Payables" },
            { v: "payables", l: "Supplier Payables" },
            { v: "credits", l: "Credits & Deposits" },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-400 data-[state=active]:text-amber-400 data-[state=active]:bg-transparent px-4 py-2 text-sm"
            >
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="spend" className="mt-6">
          <SpendSummaryTab
            tenantId={tenantId}
            venue={venue}
            periodStart={pStart}
            periodEnd={pEnd}
            prevStart={pmStart}
            prevEnd={pmEnd}
            label={`${MONTHS_LONG[month]} ${year}`}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-6">
          <SupplierAccountsTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="open-payables" className="mt-6">
          <OpenPayablesTab tenantId={tenantId} venues={venues} />
        </TabsContent>

        <TabsContent value="payables" className="mt-6">
          <SupplierPayablesTab tenantId={tenantId} venues={venues} />
        </TabsContent>

        <TabsContent value="credits" className="mt-6">
          <CreditsDepositsTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================== TAB 1 — SPEND SUMMARY ===================

type GrnRow = {
  accepted_qty: number | null;
  unit_cost: number | null;
  product_master_id: string | null;
  goods_received_notes: { received_date: string | null; status: string | null; venue: string | null } | null;
  product_master: { level1_category: string | null; financial_treatment: string | null; creates_stock_movement: boolean | null } | null;
};

function SpendSummaryTab({
  tenantId, venue, periodStart, periodEnd, prevStart, prevEnd, label,
}: {
  tenantId: string | null; venue: string; periodStart: string; periodEnd: string;
  prevStart: string; prevEnd: string; label: string;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [refundsTotal, setRefundsTotal] = useState(0);
  const [refundsCount, setRefundsCount] = useState(0);
  const [cnApplied, setCnApplied] = useState(0);
  const [cnCount, setCnCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // GRN items joined to GRN + product_master, with explicit FK hints
      // (relationship conflict fix established earlier).
      const select = "accepted_qty, unit_cost, product_master_id, goods_received_notes!grn_id(received_date, status, venue), product_master!product_master_id(level1_category, financial_treatment, creates_stock_movement)";
      let q: any = (supabase as any).from("grn_items").select(select).eq("tenant_id", tenantId);
      const { data: grnData } = await q;
      const all = (grnData || []) as GrnRow[];
      if (cancelled) return;
      setRows(all);

      // Refund lines from invoice_line_items (negative unit_price + non-stock products)
      const { data: refundData } = await (supabase as any)
        .from("invoice_line_items")
        .select("quantity, unit_price, total, invoice_id, product_master_id, invoices!invoice_id(invoice_date, venue), product_master!product_master_id(creates_stock_movement)")
        .eq("tenant_id", tenantId);
      let refSum = 0; let refN = 0;
      for (const r of (refundData || []) as any[]) {
        const date = r.invoices?.venue ? r.invoices?.invoice_date : r.invoices?.invoice_date;
        if (!date || date < periodStart || date >= periodEnd) continue;
        if (venue !== "all" && r.invoices?.venue !== venue) continue;
        const price = Number(r.unit_price) || 0;
        const csm = r.product_master?.creates_stock_movement;
        const lineTotal = Number(r.total) || (Number(r.quantity) || 0) * price;
        if (price < 0 || (csm === false && lineTotal < 0)) {
          refSum += Math.abs(lineTotal);
          refN += 1;
        }
      }
      if (cancelled) return;
      setRefundsTotal(refSum);
      setRefundsCount(refN);

      // Credit notes applied in period (approved or fully_applied, in date range)
      const cns = await fetchAllRows(
        "credit_notes",
        "credit_note_date, original_amount, remaining_balance, status, venue",
        undefined,
        tenantId,
      );
      let cnSum = 0; let cnN = 0;
      for (const c of cns as any[]) {
        const d = c.credit_note_date;
        if (!d || d < periodStart || d >= periodEnd) continue;
        if (!["fully_applied", "approved"].includes(c.status)) continue;
        if (venue !== "all" && c.venue && c.venue !== venue) continue;
        const orig = Number(c.original_amount) || 0;
        const rem = Number(c.remaining_balance) || 0;
        cnSum += Math.max(0, orig - rem);
        cnN += 1;
      }
      if (cancelled) return;
      setCnApplied(cnSum);
      setCnCount(cnN);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, venue, periodStart, periodEnd]);

  const inPeriod = (r: GrnRow, status: "confirmed" | "disputed", start: string, end: string) => {
    const g = r.goods_received_notes;
    const pm = r.product_master;
    if (!g || !pm) return false;
    if (g.status !== status) return false;
    if (!g.received_date || g.received_date < start || g.received_date >= end) return false;
    if (venue !== "all" && g.venue !== venue) return false;
    if (pm.creates_stock_movement === false) return false;
    if (pm.financial_treatment && /^Asset/i.test(pm.financial_treatment)) return false;
    return true;
  };
  const rowValue = (r: GrnRow) => (Number(r.accepted_qty) || 0) * (Number(r.unit_cost) || 0);

  const netSpend = useMemo(() => rows.filter((r) => inPeriod(r, "confirmed", periodStart, periodEnd)).reduce((s, r) => s + rowValue(r), 0), [rows, venue, periodStart, periodEnd]);
  const prevNetSpend = useMemo(() => rows.filter((r) => inPeriod(r, "confirmed", prevStart, prevEnd)).reduce((s, r) => s + rowValue(r), 0), [rows, venue, prevStart, prevEnd]);
  const disputed = useMemo(() => rows.filter((r) => inPeriod(r, "disputed", periodStart, periodEnd)).reduce((s, r) => s + rowValue(r), 0), [rows, venue, periodStart, periodEnd]);

  const deductions = refundsTotal + cnApplied;
  const grossSpend = netSpend; // GRN value already represents accepted spend; deductions display only
  const netAfter = grossSpend - deductions;

  const pctChange = prevNetSpend > 0 ? ((netSpend - prevNetSpend) / prevNetSpend) * 100 : 0;
  const pctUp = pctChange >= 0;

  // category breakdown
  const byCategory = useMemo(() => {
    const cur = new Map<string, number>();
    const prev = new Map<string, number>();
    for (const r of rows) {
      const cat = r.product_master?.level1_category || "Uncategorised";
      if (inPeriod(r, "confirmed", periodStart, periodEnd)) cur.set(cat, (cur.get(cat) || 0) + rowValue(r));
      if (inPeriod(r, "confirmed", prevStart, prevEnd)) prev.set(cat, (prev.get(cat) || 0) + rowValue(r));
    }
    const keys = Array.from(new Set([...cur.keys(), ...prev.keys()]));
    return keys.map((k) => {
      const c = cur.get(k) || 0;
      const p = prev.get(k) || 0;
      const change = p > 0 ? ((c - p) / p) * 100 : 0;
      return { category: k, current: c, prev: p, change };
    }).sort((a, b) => b.current - a.current);
  }, [rows, venue, periodStart, periodEnd, prevStart, prevEnd]);

  const totalCur = byCategory.reduce((s, r) => s + r.current, 0);
  const totalPrev = byCategory.reduce((s, r) => s + r.prev, 0);
  const totalChange = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Net spend" value={fmtMoney(netSpend)} />
        <KCard label="Refunds & credits" value={fmtMoney(deductions)} tone="green" sub={`${refundsCount} refunds · ${cnCount} credit notes`} />
        <KCard label="Disputes outstanding" value={fmtMoney(disputed)} tone="amber" />
        <KCard
          label="vs last month"
          value={`${pctUp ? "+" : ""}${pctChange.toFixed(1)}%`}
          tone={pctUp ? "red" : "green"}
          sub={<span className="inline-flex items-center gap-1">{pctUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} prev {fmtMoney(prevNetSpend)}</span>}
        />
      </div>

      {disputed > 0.001 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>{fmtMoney(disputed)} in disputes not included above</span>
          </div>
          <Button asChild size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:text-amber-200">
            <Link to="/procurement/invoices?status=disputed">View disputes</Link>
          </Button>
        </div>
      )}

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Spend by category</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Category</th>
                    <th className="text-right py-2 pr-4">This month</th>
                    <th className="text-right py-2 pr-4">Last month</th>
                    <th className="text-right py-2 pr-4">Change</th>
                    <th className="text-left py-2 w-[140px]">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((r) => {
                    const share = totalCur > 0 ? (r.current / totalCur) * 100 : 0;
                    const up = r.change >= 0;
                    return (
                      <tr key={r.category} className="border-b border-border/40">
                        <td className="py-2 pr-4">{r.category}</td>
                        <td className="py-2 pr-4 text-right td-num">{fmtMoney(r.current)}</td>
                        <td className="py-2 pr-4 text-right td-num text-muted-foreground">{fmtMoney(r.prev)}</td>
                        <td className={`py-2 pr-4 text-right td-num ${up ? "text-red-400" : "text-emerald-400"}`}>
                          {up ? "+" : ""}{r.change.toFixed(1)}% {up ? "↑" : "↓"}
                        </td>
                        <td className="py-2">
                          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                            <div className="h-full bg-amber-400/70" style={{ width: `${Math.min(100, share).toFixed(1)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 pr-4 text-right td-num">{fmtMoney(totalCur)}</td>
                    <td className="py-2 pr-4 text-right td-num text-muted-foreground">{fmtMoney(totalPrev)}</td>
                    <td className={`py-2 pr-4 text-right td-num ${totalChange >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(1)}% {totalChange >= 0 ? "↑" : "↓"}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Deductions</SectionLabel>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span>Supplier refunds</span>
              <span className="td-num text-emerald-400">−{fmtMoney(refundsTotal)} <span className="text-muted-foreground text-xs">({refundsCount} items)</span></span>
            </div>
            <div className="flex justify-between">
              <span>Credit notes applied</span>
              <span className="td-num text-emerald-400">−{fmtMoney(cnApplied)} <span className="text-muted-foreground text-xs">({cnCount} notes)</span></span>
            </div>
            <div className="border-t border-border my-2" />
            <div className="flex justify-between font-medium">
              <span>Total deductions</span>
              <span className="td-num">−{fmtMoney(deductions)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold pt-2 mt-2 border-t border-border">
              <span className="uppercase tracking-wide text-xs text-muted-foreground self-end">Net spend {label}</span>
              <span className="td-num">{fmtMoney(netAfter)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =================== TAB 2 — SUPPLIER PAYABLES ===================

function SupplierPayablesTab({ tenantId, venues }: { tenantId: string; venues: string[] }) {
  const { invoices, supplierSummary, paidThisMonth, creditNotes, creditNotesAvailable, bankAccounts, loading, refresh } = usePayables();
  const [payInvoice, setPayInvoice] = useState<APInvoice | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<APInvoice | null>(null);
  const [bookCNOpen, setBookCNOpen] = useState(false);
  const [bookCNSupplierId, setBookCNSupplierId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  // Extra tenant-scoped data for the ledger sheet
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [allocRows, setAllocRows] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [pays, allocs] = await Promise.all([
        fetchAllRows("payments", "id, payment_date, amount, payment_method, paid_from_account_id, reference_number, cheque_number, notes, supplier_id, match_status", undefined, tenantId),
        fetchAllRows("payment_allocations", "id, payment_id, invoice_id, amount_allocated, credit_note_id, credit_note_amount_applied", undefined, tenantId),
      ]);
      setPaymentRows(pays);
      setAllocRows(allocs);
    })();
  }, [tenantId, refreshKey]);

  const refetch = () => { refresh(); setRefreshKey((k) => k + 1); };

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const totals = useMemo(() => {
    let total = 0; let overdue = 0; let dueSoon = 0;
    const aging = [0, 0, 0, 0, 0];
    for (const inv of invoices) {
      if (inv.outstanding_amount <= 0 || inv.payment_status === "voided") continue;
      total += inv.outstanding_amount;
      const age = inv.age_days;
      if (inv.due_date && inv.due_date < todayStr) overdue += inv.outstanding_amount;
      if (inv.due_date && inv.due_date >= todayStr && inv.due_date <= inSevenDays) dueSoon += inv.outstanding_amount;
      if (age <= 0) aging[0] += inv.outstanding_amount;
      else if (age <= 30) aging[1] += inv.outstanding_amount;
      else if (age <= 60) aging[2] += inv.outstanding_amount;
      else if (age <= 90) aging[3] += inv.outstanding_amount;
      else aging[4] += inv.outstanding_amount;
    }
    return { total, overdue, dueSoon, aging };
  }, [invoices, todayStr, inSevenDays]);

  const agingTotal = totals.aging.reduce((s, n) => s + n, 0) || 1;
  const agingMeta = [
    { label: "Current", color: "bg-emerald-500" },
    { label: "1-30 days", color: "bg-sky-500" },
    { label: "31-60 days", color: "bg-amber-500" },
    { label: "61-90 days", color: "bg-purple-500" },
    { label: "90+ days", color: "bg-red-500" },
  ];

  // Credits available per supplier
  const creditsBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const cn of creditNotesAvailable) {
      map.set(cn.supplier_id, (map.get(cn.supplier_id) || 0) + cn.remaining_balance);
    }
    return map;
  }, [creditNotesAvailable]);

  const selectedSupplier = supplierSummary.find((s) => s.supplier_id === selectedSupplierId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.total)} tone={totals.total > 0 ? "amber" : "default"} />
        <KCard label="Overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Due this week" value={fmtMoney(totals.dueSoon)} tone="sky" />
        <KCard label="Paid this month" value={fmtMoney(paidThisMonth)} tone="green" />
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Aging breakdown</SectionLabel>
          <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted/30">
            {totals.aging.map((v, i) => (
              <div key={i} className={agingMeta[i].color} style={{ width: `${(v / agingTotal) * 100}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs">
            {totals.aging.map((v, i) => (
              <div key={i}>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${agingMeta[i].color}`} />
                  {agingMeta[i].label}
                </div>
                <div className="td-num text-sm mt-0.5">{fmtMoney(v)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Suppliers with outstanding balances</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : supplierSummary.length === 0 ? (
            <div className="text-sm text-muted-foreground">No outstanding payables.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-right py-2 pr-4">Outstanding</th>
                    <th className="text-right py-2 pr-4">Open invoices</th>
                    <th className="text-right py-2 pr-4">Oldest</th>
                    <th className="text-right py-2 pr-4">Credits available</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierSummary.map((s) => {
                    const supplierInvs = invoices.filter((i) => i.supplier_id === s.supplier_id);
                    const oldestOpen = supplierInvs
                      .filter((i) => i.outstanding_amount > 0)
                      .sort((a, b) => (a.due_date || a.invoice_date).localeCompare(b.due_date || b.invoice_date))[0] || null;
                    const credit = creditsBySupplier.get(s.supplier_id) || 0;
                    return (
                      <tr key={s.supplier_id} className="border-b border-border/40">
                        <td className="py-2 pr-4">
                          <button
                            className="font-semibold text-left hover:text-amber-400 hover:underline"
                            onClick={() => { setSelectedSupplierId(s.supplier_id); setLedgerOpen(true); }}
                          >
                            {s.supplier_name}
                          </button>
                        </td>
                        <td className={`py-2 pr-4 text-right td-num ${s.outstanding > 0 ? "text-amber-400 font-semibold" : ""}`}>{fmtMoney(s.outstanding)}</td>
                        <td className="py-2 pr-4 text-right td-num">{s.open_count}</td>
                        <td className={`py-2 pr-4 text-right td-num ${s.oldest_age > 60 ? "text-red-400" : ""}`}>{s.oldest_age}d</td>
                        <td className={`py-2 pr-4 text-right td-num ${credit > 0 ? "text-green-400" : "text-muted-foreground/60"}`}>{credit > 0 ? fmtMoney(credit) : "—"}</td>
                        <td className="py-2 text-right space-x-1">
                          <Button size="sm" variant="outline" disabled={!oldestOpen} onClick={() => oldestOpen && setPayInvoice(oldestOpen)}>Pay</Button>
                          <Button size="sm" variant="outline" onClick={() => { setBookCNSupplierId(s.supplier_id); setBookCNOpen(true); }}>Book CN</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedSupplierId(s.supplier_id); setLedgerOpen(true); }}>View ledger</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Bank reconciliation and journal verification available in{" "}
        <Link to="/finance/payables" className="text-amber-400 hover:underline">Finance → Accounts Payable →</Link>
      </div>

      <RecordPaymentDialog
        open={!!payInvoice}
        onOpenChange={(o) => { if (!o) setPayInvoice(null); }}
        invoice={payInvoice}
        supplierInvoices={invoices}
        bankAccounts={bankAccounts}
        creditNotes={creditNotesAvailable}
        onSaved={() => { setPayInvoice(null); refetch(); }}
      />
      <PaymentHistoryDialog
        open={!!historyInvoice}
        onOpenChange={(o) => { if (!o) setHistoryInvoice(null); }}
        invoice={historyInvoice}
        onChanged={() => refetch()}
      />
      <BookCreditNoteDialog
        open={bookCNOpen}
        onOpenChange={setBookCNOpen}
        suppliers={supplierSummary.map((s) => [s.supplier_id, s.supplier_name] as [string, string])}
        venues={venues}
        invoices={invoices}
        defaultSupplierId={bookCNSupplierId}
        onSaved={() => { setBookCNOpen(false); refetch(); }}
      />
      {selectedSupplier && (
        <SupplierLedgerSheet
          open={ledgerOpen}
          onOpenChange={setLedgerOpen}
          supplierId={selectedSupplier.supplier_id}
          supplierName={selectedSupplier.supplier_name}
          invoices={invoices.filter((i) => i.supplier_id === selectedSupplier.supplier_id)}
          allInvoices={invoices}
          creditNotes={creditNotes.filter((cn) => cn.supplier_id === selectedSupplier.supplier_id)}
          payments={paymentRows.filter((p: any) => p.supplier_id === selectedSupplier.supplier_id)}
          allocations={allocRows}
          bankAccounts={bankAccounts}
          venues={venues}
          tenantId={tenantId || ""}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

// =================== TAB 3 — CREDITS & DEPOSITS ===================

function CreditsDepositsTab({ tenantId }: { tenantId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [cns, setCns] = useState<any[]>([]);
  const [supplierMap, setSupplierMap] = useState<Map<string, string>>(new Map());
  const [deposits, setDeposits] = useState<{ supplier_id: string; supplier_name: string; paid: number; returned: number; net: number }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Suppliers map
      const suppliers = await fetchAllRows("suppliers", "id, name", undefined, tenantId);
      const map = new Map<string, string>();
      for (const s of suppliers as any[]) map.set(s.id, s.name || "—");
      if (cancelled) return;
      setSupplierMap(map);

      // Credit notes
      const creditNotes = await fetchAllRows(
        "credit_notes",
        "id, credit_note_number, credit_note_date, original_amount, remaining_balance, status, supplier_id",
        undefined,
        tenantId,
      );
      if (cancelled) return;
      setCns(creditNotes);

      // Deposit lines (all-time)
      const { data: depLines } = await (supabase as any)
        .from("invoice_line_items")
        .select("quantity, unit_price, total, product_master_id, invoice_id, product_master!product_master_id(financial_treatment), invoices!invoice_id(supplier_id)")
        .eq("tenant_id", tenantId);
      const agg = new Map<string, { paid: number; returned: number }>();
      for (const l of (depLines || []) as any[]) {
        const ft = l.product_master?.financial_treatment;
        if (!ft || !/^Asset - Supplier Deposit/i.test(ft)) continue;
        const sid = l.invoices?.supplier_id;
        if (!sid) continue;
        const lineTotal = Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
        const cur = agg.get(sid) || { paid: 0, returned: 0 };
        if (lineTotal >= 0) cur.paid += lineTotal;
        else cur.returned += Math.abs(lineTotal);
        agg.set(sid, cur);
      }
      const list = Array.from(agg.entries()).map(([sid, v]) => ({
        supplier_id: sid,
        supplier_name: map.get(sid) || "—",
        paid: v.paid,
        returned: v.returned,
        net: v.paid - v.returned,
      })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      if (cancelled) return;
      setDeposits(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const available = useMemo(() => cns.filter((c) => c.status === "approved" && (Number(c.remaining_balance) || 0) > 0.01).reduce((s, c) => s + (Number(c.remaining_balance) || 0), 0), [cns]);
  const pendingReview = useMemo(() => cns.filter((c) => c.status === "needs_review" || c.status === "draft").length, [cns]);

  const depTotals = useMemo(() => {
    let paid = 0; let returned = 0;
    for (const d of deposits) { paid += d.paid; returned += d.returned; }
    return { paid, returned, net: paid - returned };
  }, [deposits]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-secondary text-secondary-foreground",
      approved: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
      fully_applied: "bg-green-500/15 text-green-400 border border-green-500/30",
      needs_review: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
      voided: "bg-red-500/15 text-red-400 border border-red-500/30",
    };
    const label: Record<string, string> = {
      draft: "Draft", approved: "Approved", fully_applied: "Fully applied",
      needs_review: "Needs review", voided: "Voided",
    };
    return <Badge variant="outline" className={`text-[10px] ${map[s] || map.draft}`}>{label[s] || s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Credit notes</SectionLabel>
            <div className="text-xs text-muted-foreground">
              Available credits: <span className="text-emerald-400 td-num">{fmtMoney(available)}</span>
              <span className="mx-2">·</span>
              Pending review: <span className="text-amber-400 td-num">{pendingReview}</span>
            </div>
          </div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : cns.length === 0 ? (
            <div className="text-sm text-muted-foreground">No credit notes yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">CN #</th>
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-right py-2 pr-4">Original</th>
                    <th className="text-right py-2 pr-4">Remaining</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cns.map((c) => {
                    const rem = Number(c.remaining_balance) || 0;
                    return (
                      <tr key={c.id} className="border-b border-border/40">
                        <td className="py-2 pr-4">{c.credit_note_number || "—"}</td>
                        <td className="py-2 pr-4">{supplierMap.get(c.supplier_id) || "—"}</td>
                        <td className="py-2 pr-4">{fmtDate(c.credit_note_date)}</td>
                        <td className="py-2 pr-4 text-right td-num">{fmtMoney(Number(c.original_amount) || 0)}</td>
                        <td className={`py-2 pr-4 text-right td-num ${rem > 0 ? "text-amber-400" : ""}`}>{fmtMoney(rem)}</td>
                        <td className="py-2">{statusBadge(c.status || "draft")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Deposit position</SectionLabel>
            <div className="text-xs text-muted-foreground">
              Paid: <span className="td-num">{fmtMoney(depTotals.paid)}</span>
              <span className="mx-2">·</span>
              Returned: <span className="td-num">{fmtMoney(depTotals.returned)}</span>
              <span className="mx-2">·</span>
              Net outstanding: <span className={`td-num ${depTotals.net > 0 ? "text-amber-400" : depTotals.net < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtMoney(depTotals.net)}</span>
            </div>
          </div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : deposits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No deposit activity yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-right py-2 pr-4">Paid</th>
                    <th className="text-right py-2 pr-4">Returned</th>
                    <th className="text-right py-2">Net outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.supplier_id} className="border-b border-border/40">
                      <td className="py-2 pr-4">{d.supplier_name}</td>
                      <td className="py-2 pr-4 text-right td-num">{fmtMoney(d.paid)}</td>
                      <td className="py-2 pr-4 text-right td-num">{fmtMoney(d.returned)}</td>
                      <td className={`py-2 text-right td-num ${d.net > 0 ? "text-amber-400" : d.net < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtMoney(d.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-3">
            Full deposit history available in <Link to="/procurement/deposit-ledger" className="text-amber-400 hover:underline">Procurement → Deposit Ledger →</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =================== TAB — SUPPLIER ACCOUNTS ===================

function SupplierAccountsTab({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const { invoices, creditNotesAvailable, loading } = usePayables();
  const [payments, setPayments] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<any[]>([]);
  const [supplierMap, setSupplierMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      // payments & payment_allocations have no tenant_id — fetch all, filter client-side
      const [pays, alcs, sups] = await Promise.all([
        fetchAllRows("payments", "id, payment_date, amount, supplier_id"),
        fetchAllRows("payment_allocations", "id, payment_id, amount_allocated"),
        fetchAllRows("suppliers", "id, name", undefined, tenantId),
      ]);
      setPayments(pays);
      setAllocs(alcs);
      const m = new Map<string, string>();
      for (const s of sups as any[]) m.set(s.id, s.name || "—");
      setSupplierMap(m);
    })();
  }, [tenantId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const tenantSupplierIds = new Set(
      invoices.map((i) => i.supplier_id).filter(Boolean) as string[]
    );
    for (const cn of creditNotesAvailable) tenantSupplierIds.add(cn.supplier_id);

    const allocSumByPayment = new Map<string, number>();
    for (const a of allocs) {
      allocSumByPayment.set(a.payment_id, (allocSumByPayment.get(a.payment_id) || 0) + (Number(a.amount_allocated) || 0));
    }

    type Agg = {
      supplier_id: string;
      supplier_name: string;
      current_balance: number;
      overdue_balance: number;
      available_credits: number;
      unallocated_payments: number;
      open_invoice_count: number;
      last_transaction_date: string | null;
    };
    const m = new Map<string, Agg>();
    const get = (sid: string): Agg => {
      let a = m.get(sid);
      if (!a) {
        a = {
          supplier_id: sid,
          supplier_name: supplierMap.get(sid) || "—",
          current_balance: 0, overdue_balance: 0, available_credits: 0,
          unallocated_payments: 0, open_invoice_count: 0, last_transaction_date: null,
        };
        m.set(sid, a);
      }
      return a;
    };

    for (const inv of invoices) {
      if (!inv.supplier_id) continue;
      const a = get(inv.supplier_id);
      if (!a.supplier_name || a.supplier_name === "—") a.supplier_name = inv.supplier_name;
      if (inv.outstanding_amount > 0 && inv.payment_status !== "voided") {
        a.current_balance += inv.outstanding_amount;
        a.open_invoice_count += 1;
        if (inv.due_date && inv.due_date < todayStr) a.overdue_balance += inv.outstanding_amount;
      }
      if (!a.last_transaction_date || (inv.invoice_date || "") > a.last_transaction_date) {
        a.last_transaction_date = inv.invoice_date;
      }
    }
    for (const cn of creditNotesAvailable) {
      const a = get(cn.supplier_id);
      a.available_credits += cn.remaining_balance;
      if (!a.last_transaction_date || (cn.credit_note_date || "") > a.last_transaction_date) {
        a.last_transaction_date = cn.credit_note_date;
      }
    }
    for (const p of payments) {
      if (!p.supplier_id || !tenantSupplierIds.has(p.supplier_id)) continue;
      const a = get(p.supplier_id);
      const amt = Number(p.amount) || 0;
      const allocated = allocSumByPayment.get(p.id) || 0;
      const unalloc = Math.max(0, amt - allocated);
      if (unalloc > 0.01) a.unallocated_payments += unalloc;
      if (!a.last_transaction_date || (p.payment_date || "") > a.last_transaction_date) {
        a.last_transaction_date = p.payment_date;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.current_balance - a.current_balance);
  }, [invoices, creditNotesAvailable, payments, allocs, supplierMap, todayStr]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0, credits = 0, unalloc = 0;
    for (const r of rows) {
      outstanding += r.current_balance;
      overdue += r.overdue_balance;
      credits += r.available_credits;
      unalloc += r.unallocated_payments;
    }
    return { outstanding, overdue, credits, unalloc };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.outstanding)} tone={totals.outstanding > 0 ? "amber" : "default"} />
        <KCard label="Total overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Available credits" value={fmtMoney(totals.credits)} tone="green" />
        <KCard label="Unallocated payments" value={fmtMoney(totals.unalloc)} tone={totals.unalloc > 0 ? "amber" : "default"} />
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Suppliers ({rows.length})</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No supplier activity yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-right py-2 pr-4">Balance</th>
                    <th className="text-right py-2 pr-4">Overdue</th>
                    <th className="text-right py-2 pr-4">Available credits</th>
                    <th className="text-right py-2 pr-4">Unallocated payments</th>
                    <th className="text-right py-2 pr-4">Open invoices</th>
                    <th className="text-left py-2 pr-4">Last activity</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.supplier_id} className={`border-b border-border/40 ${r.overdue_balance > 0 ? "border-l-2 border-l-amber-400" : ""}`}>
                      <td className="py-2 pr-4 font-semibold">{r.supplier_name}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.current_balance > 0 ? "text-amber-400" : ""}`}>{fmtMoney(r.current_balance)}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.overdue_balance > 0 ? "text-red-400" : "text-muted-foreground/60"}`}>{r.overdue_balance > 0 ? fmtMoney(r.overdue_balance) : "—"}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.available_credits > 0 ? "text-emerald-400" : "text-muted-foreground/60"}`}>{r.available_credits > 0 ? fmtMoney(r.available_credits) : "—"}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums">
                        {r.unallocated_payments > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">Unallocated</Badge>
                            {fmtMoney(r.unallocated_payments)}
                          </span>
                        ) : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-right td-num">{r.open_invoice_count}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{fmtDate(r.last_transaction_date)}</td>
                      <td className="py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/procurement/finance/suppliers/${r.supplier_id}`)}>
                          View account <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =================== TAB — OPEN PAYABLES ===================

const AGEING_BUCKETS = [
  { v: "all", l: "All" },
  { v: "current", l: "Current" },
  { v: "1-30", l: "1–30 days" },
  { v: "31-60", l: "31–60 days" },
  { v: "61-90", l: "61–90 days" },
  { v: "90+", l: "90+ days" },
];

function OpenPayablesTab({ tenantId: _t, venues }: { tenantId: string | null; venues: string[] }) {
  const { invoices, creditNotesAvailable, bankAccounts, loading, refresh } = usePayables();
  const [bucket, setBucket] = useState("all");
  const [payInvoice, setPayInvoice] = useState<APInvoice | null>(null);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const openInvoices = useMemo(() => {
    return invoices.filter((i) => i.outstanding_amount > 0 && i.payment_status !== "voided");
    // usePayables already filters to review_status === Approved
  }, [invoices]);

  const withAging = useMemo(() => openInvoices.map((i) => {
    const due = i.due_date || i.invoice_date;
    const daysOverdue = due ? Math.floor((today.getTime() - new Date(due).getTime()) / 86400000) : 0;
    return { inv: i, daysOverdue: Math.max(0, daysOverdue), isOverdue: daysOverdue > 0 };
  }), [openInvoices, todayStr]);

  const bucketed = useMemo(() => withAging.filter(({ daysOverdue, inv }) => {
    if (bucket === "all") return true;
    if (bucket === "current") return !inv.due_date || inv.due_date >= todayStr;
    if (bucket === "1-30") return daysOverdue >= 1 && daysOverdue <= 30;
    if (bucket === "31-60") return daysOverdue >= 31 && daysOverdue <= 60;
    if (bucket === "61-90") return daysOverdue >= 61 && daysOverdue <= 90;
    if (bucket === "90+") return daysOverdue > 90;
    return true;
  }), [withAging, bucket, todayStr]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0, dueWeek = 0;
    for (const i of openInvoices) {
      outstanding += i.outstanding_amount;
      if (i.due_date && i.due_date < todayStr) overdue += i.outstanding_amount;
      if (i.due_date && i.due_date >= todayStr && i.due_date <= inSevenDays) dueWeek += i.outstanding_amount;
    }
    const credits = creditNotesAvailable.reduce((s, c) => s + c.remaining_balance, 0);
    return { outstanding, overdue, dueWeek, credits };
  }, [openInvoices, creditNotesAvailable, todayStr, inSevenDays]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.outstanding)} tone={totals.outstanding > 0 ? "amber" : "default"} />
        <KCard label="Total overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Due this week" value={fmtMoney(totals.dueWeek)} tone="sky" />
        <KCard label="Available credits" value={fmtMoney(totals.credits)} tone="green" />
      </div>

      <div className="flex flex-wrap gap-2">
        {AGEING_BUCKETS.map((b) => (
          <button
            key={b.v}
            onClick={() => setBucket(b.v)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${bucket === b.v ? "bg-amber-400/15 border-amber-400 text-amber-400" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {b.l}
          </button>
        ))}
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Open invoices ({bucketed.length})</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : bucketed.length === 0 ? (
            <div className="text-sm text-muted-foreground">No invoices in this bucket.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-left py-2 pr-4">Invoice #</th>
                    <th className="text-left py-2 pr-4">Venue</th>
                    <th className="text-left py-2 pr-4">Invoice date</th>
                    <th className="text-left py-2 pr-4">Due date</th>
                    <th className="text-right py-2 pr-4">Total</th>
                    <th className="text-right py-2 pr-4">Paid</th>
                    <th className="text-right py-2 pr-4">Outstanding</th>
                    <th className="text-right py-2 pr-4">Days overdue</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bucketed.map(({ inv, daysOverdue }) => {
                    const disputed = inv.payment_status === "disputed" || inv.raw_payment_status === "disputed";
                    return (
                      <tr key={inv.id} className={`border-b border-border/40 ${disputed ? "border-l-2 border-l-amber-400" : ""}`}>
                        <td className="py-2 pr-4">{inv.supplier_name}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                        <td className="py-2 pr-4">{inv.venue || "—"}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.invoice_date)}</td>
                        <td className="py-2 pr-4">{fmtDate(inv.due_date)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(inv.total_amount)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(inv.amount_paid)}</td>
                        <td className="py-2 pr-4 text-right td-num tabular-nums text-amber-400">{fmtMoney(inv.outstanding_amount)}</td>
                        <td className={`py-2 pr-4 text-right td-num tabular-nums ${daysOverdue > 60 ? "text-red-400" : daysOverdue > 0 ? "text-amber-400" : "text-muted-foreground/60"}`}>{daysOverdue > 0 ? `${daysOverdue}d` : "—"}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-[10px]">{inv.payment_status}</Badge>
                        </td>
                        <td className="py-2 text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => setPayInvoice(inv)}>Pay</Button>
                          {inv.file_url && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={inv.file_url} target="_blank" rel="noreferrer">View</a>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={!!payInvoice}
        onOpenChange={(o) => { if (!o) setPayInvoice(null); }}
        invoice={payInvoice}
        supplierInvoices={invoices}
        bankAccounts={bankAccounts}
        creditNotes={creditNotesAvailable}
        onSaved={() => { setPayInvoice(null); refresh(); }}
      />
      {/* venues prop reserved for future filter UI */}
      <span className="hidden">{venues.length}</span>
    </div>
  );
}
