import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

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

type AllocRow = {
  amount: number | null;
  expense_category: string | null;
  venue: string | null;
  bill_id: string;
  expense_bills: { bill_date: string | null; supplier_id: string | null; vendor_name: string | null; approval_status: string | null } | null;
};

export default function ExpenseSpendSummaryPage() {
  const { tenantId } = useActiveTenant();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [venue, setVenue] = useState<string>("all");
  const [venues, setVenues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AllocRow[]>([]);
  const [supplierMap, setSupplierMap] = useState<Map<string, string>>(new Map());

  const { start: periodStart, end: periodEnd } = useMemo(() => monthBounds(year, month), [year, month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthBounds(year, month - 1), [year, month]);
  const label = `${MONTHS_LONG[month]} ${year}`;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sups = await fetchAllRows("suppliers", "id, name, vendor_type", undefined, tenantId);
      const m = new Map<string, string>();
      const vendorIds = new Set<string>();
      for (const s of sups as any[]) {
        if (s.vendor_type === "expense") { m.set(s.id, s.name || "—"); vendorIds.add(s.id); }
      }
      if (cancelled) return;
      setSupplierMap(m);

      const { data } = await (supabase as any)
        .from("expense_bill_allocations")
        .select("amount, expense_category, venue, bill_id, expense_bills!bill_id(bill_date, supplier_id, vendor_name, approval_status)")
        .eq("tenant_id", tenantId);
      const filtered = (data || []).filter((r: AllocRow) => {
        const b = r.expense_bills;
        if (!b) return false;
        if (b.approval_status === "voided" || b.approval_status === "reversed") return false;
        return !b.supplier_id || vendorIds.has(b.supplier_id);
      });
      if (cancelled) return;
      setRows(filtered);

      const venueSet = new Set<string>();
      for (const r of filtered as AllocRow[]) if (r.venue) venueSet.add(r.venue);
      setVenues(Array.from(venueSet).sort());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const inPeriod = (r: AllocRow, start: string, end: string) => {
    const d = r.expense_bills?.bill_date;
    if (!d || d < start || d >= end) return false;
    if (venue !== "all" && r.venue !== venue) return false;
    return true;
  };
  const amt = (r: AllocRow) => Number(r.amount) || 0;

  const netSpend = useMemo(() => rows.filter((r) => inPeriod(r, periodStart, periodEnd)).reduce((s, r) => s + amt(r), 0), [rows, venue, periodStart, periodEnd]);
  const prevSpend = useMemo(() => rows.filter((r) => inPeriod(r, prevStart, prevEnd)).reduce((s, r) => s + amt(r), 0), [rows, venue, prevStart, prevEnd]);
  const billCount = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (inPeriod(r, periodStart, periodEnd)) s.add(r.bill_id);
    return s.size;
  }, [rows, venue, periodStart, periodEnd]);
  const pctChange = prevSpend > 0 ? ((netSpend - prevSpend) / prevSpend) * 100 : 0;
  const pctUp = pctChange >= 0;

  const byCategory = useMemo(() => {
    const cur = new Map<string, number>();
    const prev = new Map<string, number>();
    for (const r of rows) {
      const k = r.expense_category || "Uncategorised";
      if (inPeriod(r, periodStart, periodEnd)) cur.set(k, (cur.get(k) || 0) + amt(r));
      if (inPeriod(r, prevStart, prevEnd)) prev.set(k, (prev.get(k) || 0) + amt(r));
    }
    const keys = Array.from(new Set([...cur.keys(), ...prev.keys()]));
    return keys.map((k) => {
      const c = cur.get(k) || 0; const p = prev.get(k) || 0;
      return { category: k, current: c, prev: p, change: p > 0 ? ((c - p) / p) * 100 : 0 };
    }).sort((a, b) => b.current - a.current);
  }, [rows, venue, periodStart, periodEnd, prevStart, prevEnd]);

  const byVenue = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (inPeriod(r, periodStart, periodEnd)) {
      const k = r.venue || "Unassigned";
      m.set(k, (m.get(k) || 0) + amt(r));
    }
    return Array.from(m.entries()).map(([k, v]) => ({ venue: k, amount: v })).sort((a, b) => b.amount - a.amount);
  }, [rows, venue, periodStart, periodEnd]);

  const topVendors = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (inPeriod(r, periodStart, periodEnd)) {
      const sid = r.expense_bills?.supplier_id;
      const name = (sid && supplierMap.get(sid)) || r.expense_bills?.vendor_name || "Unknown vendor";
      m.set(name, (m.get(name) || 0) + amt(r));
    }
    return Array.from(m.entries()).map(([k, v]) => ({ vendor: k, amount: v })).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [rows, venue, periodStart, periodEnd, supplierMap]);

  const trend = useMemo(() => {
    const arr: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month - i, 1));
      const { start, end } = monthBounds(d.getUTCFullYear(), d.getUTCMonth());
      const sum = rows.filter((r) => inPeriod(r, start, end)).reduce((s, r) => s + amt(r), 0);
      arr.push({ label: `${MONTHS_LONG[d.getUTCMonth()].slice(0, 3)} ${String(d.getUTCFullYear()).slice(2)}`, amount: sum });
    }
    return arr;
  }, [rows, venue, year, month]);
  const trendMax = Math.max(1, ...trend.map((t) => t.amount));

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
          <p className="text-sm text-muted-foreground mt-0.5">Expense bill spend by category, venue, and vendor for the selected period</p>
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
        <KCard label="Total spend" value={fmtMoney(netSpend)} />
        <KCard label="Bills posted" value={String(billCount)} tone="sky" />
        <KCard label="Prev month" value={fmtMoney(prevSpend)} />
        <KCard
          label="vs last month"
          value={`${pctUp ? "+" : ""}${pctChange.toFixed(1)}%`}
          tone={pctUp ? "red" : "green"}
          sub={<span className="inline-flex items-center gap-1">{pctUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} vs {fmtMoney(prevSpend)}</span>}
        />
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Trend — last 6 months</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <div className="flex items-end gap-3 h-40">
              {trend.map((t) => (
                <div key={t.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="text-[10px] td-num text-muted-foreground">{t.amount > 0 ? fmtMoney(t.amount).replace("HK$ ", "") : ""}</div>
                  <div className="w-full rounded-t bg-amber-400/70" style={{ height: `${(t.amount / trendMax) * 100}%`, minHeight: t.amount > 0 ? 2 : 0 }} />
                  <div className="text-[10px] text-muted-foreground">{t.label}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-glass">
        <CardContent className="p-5">
          <SectionLabel>Spend by category</SectionLabel>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : byCategory.length === 0 ? (
            <div className="text-sm text-muted-foreground">No spend in this period.</div>
          ) : (
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
                          {r.prev > 0 ? `${up ? "+" : ""}${r.change.toFixed(1)}% ${up ? "↑" : "↓"}` : "—"}
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
                      {totalPrev > 0 ? `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(1)}% ${totalChange >= 0 ? "↑" : "↓"}` : "—"}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-glass">
          <CardContent className="p-5">
            <SectionLabel>Spend by venue</SectionLabel>
            {byVenue.length === 0 ? <div className="text-sm text-muted-foreground">No data.</div> : (
              <table className="w-full text-sm">
                <tbody>
                  {byVenue.map((v) => (
                    <tr key={v.venue} className="border-b border-border/40">
                      <td className="py-2">{v.venue}</td>
                      <td className="py-2 text-right td-num">{fmtMoney(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="card-glass">
          <CardContent className="p-5">
            <SectionLabel>Top vendors</SectionLabel>
            {topVendors.length === 0 ? <div className="text-sm text-muted-foreground">No data.</div> : (
              <table className="w-full text-sm">
                <tbody>
                  {topVendors.map((v) => (
                    <tr key={v.vendor} className="border-b border-border/40">
                      <td className="py-2">{v.vendor}</td>
                      <td className="py-2 text-right td-num">{fmtMoney(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
