import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthBounds = (y: number, m: number) => {
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10);
  return { start, end };
};

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

type GrnRow = {
  accepted_qty: number | null;
  unit_cost: number | null;
  product_master_id: string | null;
  goods_received_notes: { received_date: string | null; status: string | null; venue: string | null } | null;
  product_master: { level1_category: string | null; financial_treatment: string | null; creates_stock_movement: boolean | null } | null;
};

export default function SpendSummaryPage() {
  const { tenantId } = useActiveTenant();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [venue, setVenue] = useState<string>("all");
  const [venues, setVenues] = useState<string[]>([]);

  const { start: periodStart, end: periodEnd } = useMemo(() => monthBounds(year, month), [year, month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthBounds(year, month - 1), [year, month]);
  const label = `${MONTHS_LONG[month]} ${year}`;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [refundsTotal, setRefundsTotal] = useState(0);
  const [refundsCount, setRefundsCount] = useState(0);
  const [cnApplied, setCnApplied] = useState(0);
  const [cnCount, setCnCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const rs = await fetchAllRows("goods_received_notes", "venue", undefined, tenantId);
      const set = new Set<string>();
      for (const r of rs as any[]) if (r.venue) set.add(String(r.venue));
      setVenues(Array.from(set).sort());
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const select = "accepted_qty, unit_cost, product_master_id, goods_received_notes!grn_id(received_date, status, venue), product_master!product_master_id(level1_category, financial_treatment, creates_stock_movement)";
      const { data: grnData } = await (supabase as any).from("grn_items").select(select).eq("tenant_id", tenantId);
      if (cancelled) return;
      setRows((grnData || []) as GrnRow[]);

      const { data: refundData } = await (supabase as any)
        .from("invoice_line_items")
        .select("quantity, unit_price, total, invoice_id, product_master_id, invoices!invoice_id(invoice_date, venue), product_master!product_master_id(creates_stock_movement)")
        .eq("tenant_id", tenantId);
      let refSum = 0; let refN = 0;
      for (const r of (refundData || []) as any[]) {
        const date = r.invoices?.invoice_date;
        if (!date || date < periodStart || date >= periodEnd) continue;
        if (venue !== "all" && r.invoices?.venue !== venue) continue;
        const price = Number(r.unit_price) || 0;
        const csm = r.product_master?.creates_stock_movement;
        const lineTotal = Number(r.total) || (Number(r.quantity) || 0) * price;
        if (price < 0 || (csm === false && lineTotal < 0)) {
          refSum += Math.abs(lineTotal); refN += 1;
        }
      }
      if (cancelled) return;
      setRefundsTotal(refSum); setRefundsCount(refN);

      const cns = await fetchAllRows("credit_notes", "credit_note_date, original_amount, remaining_balance, status, venue", undefined, tenantId);
      let cnSum = 0; let cnN = 0;
      for (const c of cns as any[]) {
        const d = c.credit_note_date;
        if (!d || d < periodStart || d >= periodEnd) continue;
        if (!["fully_applied", "approved"].includes(c.status)) continue;
        if (venue !== "all" && c.venue && c.venue !== venue) continue;
        const orig = Number(c.original_amount) || 0;
        const rem = Number(c.remaining_balance) || 0;
        cnSum += Math.max(0, orig - rem); cnN += 1;
      }
      if (cancelled) return;
      setCnApplied(cnSum); setCnCount(cnN);
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
  const netAfter = netSpend - deductions;
  const pctChange = prevNetSpend > 0 ? ((netSpend - prevNetSpend) / prevNetSpend) * 100 : 0;
  const pctUp = pctChange >= 0;

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

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Spend Summary</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Procurement cost by category and supplier for the selected period</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card/40 px-1 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="px-2 text-sm font-medium min-w-[120px] text-center">{label}</div>
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
