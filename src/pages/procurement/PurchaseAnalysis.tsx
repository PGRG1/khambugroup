import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Download, TrendingUp, TrendingDown } from "lucide-react";
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { downloadCSV } from "@/utils/csvDownload";
import { useVirtualizer } from "@tanstack/react-virtual";

// ---------- format ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMoney = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtMoney2 = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const CAT_COLOURS = ["#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16"];
const AMBER = "#E8820C";

const tooltipStyle = {
  backgroundColor: "hsl(33, 25%, 96%)",
  border: "1px solid hsl(30, 15%, 80%)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  color: "hsl(220, 15%, 15%)",
  boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
};
const tooltipItemStyle = { color: "hsl(220, 15%, 15%)" };
const tooltipLabelStyle = { color: "hsl(220, 15%, 15%)", fontWeight: 600, fontSize: 12 };

// ---------- period ----------
type PeriodKey = "1M" | "3M" | "6M" | "12M";

function getPeriodRange(key: PeriodKey): { start: Date; end: Date; priorStart: Date; priorEnd: Date; months: { y: number; m: number; label: string }[] } {
  const now = new Date();
  let start: Date, end: Date;
  if (key === "1M") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    const n = key === "3M" ? 3 : key === "6M" ? 6 : 12;
    end = new Date(now.getFullYear(), now.getMonth(), 1); // start of current month (exclusive end of prior complete month)
    start = new Date(now.getFullYear(), now.getMonth() - n, 1);
  }
  const durMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const priorEnd = new Date(start);
  const priorStart = new Date(start.getFullYear(), start.getMonth() - durMonths, 1);
  const months: { y: number; m: number; label: string }[] = [];
  for (let i = 0; i < durMonths; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return { start, end, priorStart, priorEnd, months };
}

const inRange = (iso: string | null | undefined, start: Date, end: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// ---------- types ----------
interface GrnItem {
  accepted_qty: number | null;
  unit_cost: number | null;
  product_master_id: string | null;
  grn_id: string | null;
  goods_received_notes: {
    id: string;
    received_date: string | null;
    status: string | null;
    venue: string | null;
    supplier_id: string | null;
  } | null;
  product_master: {
    id: string;
    internal_product_name: string | null;
    internal_sku: string | null;
    level1_category: string | null;
    level2_category: string | null;
    financial_treatment: string | null;
    creates_stock_movement: boolean | null;
  } | null;
}

// ---------- page ----------
export default function PurchaseAnalysis() {
  const { tenantId } = useActiveTenant();
  const [period, setPeriod] = useState<PeriodKey>("6M");
  const [venue, setVenue] = useState("all");
  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState<GrnItem[]>([]);
  const [priorRows, setPriorRows] = useState<GrnItem[]>([]);
  const [suppliersMap, setSuppliersMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const range = useMemo(() => getPeriodRange(period), [period]);

  // venues + categories from current rows (after fetch)
  const [venueOpts, setVenueOpts] = useState<string[]>([]);
  const [categoryOpts, setCategoryOpts] = useState<string[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // suppliers
      const sups = await fetchAllRows("suppliers", "id, name", undefined, tenantId);
      const sm = new Map<string, string>();
      for (const s of sups as any[]) sm.set(s.id, s.name);
      if (cancelled) return;
      setSuppliersMap(sm);

      // Fetch all grn_items for tenant (paginated via .range)
      const PAGE = 1000;
      let offset = 0;
      const all: GrnItem[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("grn_items")
          .select(`
            accepted_qty,
            unit_cost,
            product_master_id,
            grn_id,
            goods_received_notes!grn_id ( id, received_date, status, venue, supplier_id ),
            product_master!product_master_id ( id, internal_product_name, internal_sku, level1_category, level2_category, financial_treatment, creates_stock_movement )
          `)
          .eq("tenant_id", tenantId)
          .range(offset, offset + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as any[] as GrnItem[]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      if (cancelled) return;

      // build venue/category options from anything confirmed + stock-moving + non-asset
      const vs = new Set<string>();
      const cs = new Set<string>();
      for (const it of all) {
        const grn = it.goods_received_notes;
        const pm = it.product_master;
        if (!grn || grn.status !== "confirmed") continue;
        if (pm?.creates_stock_movement === false) continue;
        if ((pm?.financial_treatment || "").toLowerCase().startsWith("asset")) continue;
        if (grn.venue) vs.add(grn.venue);
        if (pm?.level1_category) cs.add(pm.level1_category);
      }
      setVenueOpts(Array.from(vs).sort());
      setCategoryOpts(Array.from(cs).sort());

      // partition by current period vs prior period
      const cur: GrnItem[] = [];
      const prior: GrnItem[] = [];
      for (const it of all) {
        const d = it.goods_received_notes?.received_date;
        if (!d) continue;
        if (inRange(d, range.start, range.end)) cur.push(it);
        else if (inRange(d, range.priorStart, range.priorEnd)) prior.push(it);
      }
      setRows(cur);
      setPriorRows(prior);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, period, range.start.getTime(), range.end.getTime()]);

  // Common in-scope filter (already partitioned by date)
  const applyScope = (list: GrnItem[], opts: { ignoreCategory?: boolean } = {}) => {
    return list.filter((it) => {
      const grn = it.goods_received_notes;
      const pm = it.product_master;
      if (!grn || grn.status !== "confirmed") return false;
      if (pm?.creates_stock_movement === false) return false;
      if ((pm?.financial_treatment || "").toLowerCase().startsWith("asset")) return false;
      if (venue !== "all" && grn.venue !== venue) return false;
      if (!opts.ignoreCategory && category !== "all" && pm?.level1_category !== category) return false;
      return true;
    });
  };

  const scoped = useMemo(() => applyScope(rows), [rows, venue, category]);
  const scopedPrior = useMemo(() => applyScope(priorRows), [priorRows, venue, category]);

  const lineValue = (it: GrnItem) => (it.accepted_qty || 0) * (it.unit_cost || 0);

  // ---------- KPIs ----------
  const totalSpend = useMemo(() => scoped.reduce((s, it) => s + lineValue(it), 0), [scoped]);
  const priorSpend = useMemo(() => scopedPrior.reduce((s, it) => s + lineValue(it), 0), [scopedPrior]);
  const changePct = priorSpend > 0 ? ((totalSpend - priorSpend) / priorSpend) * 100 : 0;
  const distinctProducts = useMemo(() => new Set(scoped.map((it) => it.product_master_id).filter(Boolean)).size, [scoped]);
  const distinctSuppliers = useMemo(() => new Set(scoped.map((it) => it.goods_received_notes?.supplier_id).filter(Boolean)).size, [scoped]);

  // ---------- Category breakdown ----------
  const categoryAgg = useMemo(() => {
    const cur = new Map<string, number>();
    const prv = new Map<string, number>();
    for (const it of scoped) {
      const k = it.product_master?.level1_category || "Uncategorised";
      cur.set(k, (cur.get(k) || 0) + lineValue(it));
    }
    for (const it of scopedPrior) {
      const k = it.product_master?.level1_category || "Uncategorised";
      prv.set(k, (prv.get(k) || 0) + lineValue(it));
    }
    const keys = new Set([...cur.keys(), ...prv.keys()]);
    const arr = Array.from(keys).map((k, i) => ({
      name: k,
      current: cur.get(k) || 0,
      prior: prv.get(k) || 0,
      color: CAT_COLOURS[i % CAT_COLOURS.length],
    }));
    arr.sort((a, b) => b.current - a.current);
    // assign colours by sorted order (stable across renders)
    arr.forEach((c, i) => (c.color = CAT_COLOURS[i % CAT_COLOURS.length]));
    return arr;
  }, [scoped, scopedPrior]);

  const topCategory = categoryAgg[0];
  const maxCatSpend = Math.max(1, ...categoryAgg.map((c) => Math.max(c.current, c.prior)));

  // ---------- Trend ----------
  const trendData = useMemo(() => {
    const buckets = range.months.map((mo) => ({
      label: mo.label, y: mo.y, m: mo.m, total: 0,
      ...Object.fromEntries(categoryAgg.slice(0, 2).map((c) => [c.name, 0])),
    } as any));
    const idxOf = (d: string) => {
      const dt = new Date(d);
      return buckets.findIndex((b) => b.y === dt.getFullYear() && b.m === dt.getMonth());
    };
    const top2 = categoryAgg.slice(0, 2).map((c) => c.name);
    for (const it of scoped) {
      const idx = idxOf(it.goods_received_notes?.received_date || "");
      if (idx < 0) continue;
      const v = lineValue(it);
      buckets[idx].total += v;
      const cat = it.product_master?.level1_category || "Uncategorised";
      if (top2.includes(cat)) buckets[idx][cat] = (buckets[idx][cat] || 0) + v;
    }
    return buckets;
  }, [scoped, categoryAgg, range.months]);

  // ---------- Top items ----------
  const itemAgg = useMemo(() => {
    const map = new Map<string, { id: string; sku: string; name: string; category: string; qty: number; spend: number }>();
    for (const it of scoped) {
      const id = it.product_master_id || "unmatched";
      const pm = it.product_master;
      const v = lineValue(it);
      const cur = map.get(id);
      if (cur) {
        cur.qty += it.accepted_qty || 0;
        cur.spend += v;
      } else {
        map.set(id, {
          id,
          sku: pm?.internal_sku || "—",
          name: pm?.internal_product_name || "Unmatched",
          category: pm?.level1_category || "—",
          qty: it.accepted_qty || 0,
          spend: v,
        });
      }
    }
    // prior spend per product
    const priorMap = new Map<string, number>();
    for (const it of scopedPrior) {
      const id = it.product_master_id || "unmatched";
      priorMap.set(id, (priorMap.get(id) || 0) + lineValue(it));
    }
    const arr = Array.from(map.values()).map((r) => ({
      ...r,
      avgCost: r.qty > 0 ? r.spend / r.qty : 0,
      pctOfTotal: totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0,
      priorSpend: priorMap.get(r.id) || 0,
      change: (priorMap.get(r.id) || 0) > 0 ? ((r.spend - (priorMap.get(r.id) || 0)) / (priorMap.get(r.id) || 1)) * 100 : 0,
    }));
    arr.sort((a, b) => b.spend - a.spend);
    return arr;
  }, [scoped, scopedPrior, totalSpend]);

  const topItems = useMemo(() => {
    const filtered = search.trim()
      ? itemAgg.filter((r) => `${r.name} ${r.sku}`.toLowerCase().includes(search.toLowerCase()))
      : itemAgg;
    return filtered.slice(0, 20);
  }, [itemAgg, search]);

  // ---------- Supplier concentration ----------
  const supplierAgg = useMemo(() => {
    const cur = new Map<string, { spend: number; grnIds: Set<string> }>();
    const prv = new Map<string, number>();
    for (const it of scoped) {
      const sid = it.goods_received_notes?.supplier_id || "—";
      const e = cur.get(sid) || { spend: 0, grnIds: new Set<string>() };
      e.spend += lineValue(it);
      if (it.grn_id) e.grnIds.add(it.grn_id);
      cur.set(sid, e);
    }
    for (const it of scopedPrior) {
      const sid = it.goods_received_notes?.supplier_id || "—";
      prv.set(sid, (prv.get(sid) || 0) + lineValue(it));
    }
    const arr = Array.from(cur.entries()).map(([sid, e]) => ({
      id: sid,
      name: suppliersMap.get(sid) || "Unknown",
      spend: e.spend,
      grnCount: e.grnIds.size,
      prior: prv.get(sid) || 0,
    }));
    arr.sort((a, b) => b.spend - a.spend);
    return arr;
  }, [scoped, scopedPrior, suppliersMap]);

  const top3SupplierPct = useMemo(() => {
    if (totalSpend <= 0) return 0;
    const top3 = supplierAgg.slice(0, 3).reduce((s, x) => s + x.spend, 0);
    return (top3 / totalSpend) * 100;
  }, [supplierAgg, totalSpend]);

  const maxSupplierSpend = Math.max(1, ...supplierAgg.map((s) => s.spend));

  // ---------- Drill-downs ----------
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string; name: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const supplierGrns = useMemo(() => {
    if (!selectedSupplier) return [] as { grnId: string; date: string | null; venue: string | null; lines: number; qty: number; spend: number }[];
    const map = new Map<string, { grnId: string; date: string | null; venue: string | null; lines: number; qty: number; spend: number }>();
    for (const it of scoped) {
      const sid = it.goods_received_notes?.supplier_id || "—";
      if (sid !== selectedSupplier.id) continue;
      const gid = it.grn_id || "—";
      const e = map.get(gid) || { grnId: gid, date: it.goods_received_notes?.received_date || null, venue: it.goods_received_notes?.venue || null, lines: 0, qty: 0, spend: 0 };
      e.lines += 1;
      e.qty += it.accepted_qty || 0;
      e.spend += lineValue(it);
      map.set(gid, e);
    }
    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [selectedSupplier, scoped]);

  const categoryItems = useMemo(() => {
    if (!selectedCategory) return [] as { id: string; sku: string; name: string; qty: number; spend: number; pct: number }[];
    const map = new Map<string, { id: string; sku: string; name: string; qty: number; spend: number }>();
    let total = 0;
    for (const it of scoped) {
      const cat = it.product_master?.level1_category || "Uncategorised";
      if (cat !== selectedCategory) continue;
      const id = it.product_master_id || "unmatched";
      const v = lineValue(it);
      total += v;
      const cur = map.get(id);
      if (cur) { cur.qty += it.accepted_qty || 0; cur.spend += v; }
      else map.set(id, { id, sku: it.product_master?.internal_sku || "—", name: it.product_master?.internal_product_name || "Unmatched", qty: it.accepted_qty || 0, spend: v });
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, pct: total > 0 ? (r.spend / total) * 100 : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [selectedCategory, scoped]);

  const categoryTotalSpend = useMemo(() => categoryItems.reduce((s, r) => s + r.spend, 0), [categoryItems]);

  // ---------- Virtualized top items ----------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: topItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  const periodLabel = period === "1M" ? "Current month" : period === "3M" ? "Last 3 months" : period === "6M" ? "Last 6 months" : "Last 12 months";
  const GRID = "32px 80px minmax(160px,1.4fr) 100px 60px 90px 70px 80px 70px";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Purchase Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Spend by category, top items, and supplier concentration — sourced from confirmed GRNs.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card/40 p-1">
            {(["1M", "3M", "6M", "12M"] as PeriodKey[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`h-7 px-3 text-xs font-medium rounded ${period === p ? "text-white" : "bg-secondary text-muted-foreground"}`}
                style={period === p ? { backgroundColor: AMBER } : undefined}
              >
                {p}
              </button>
            ))}
          </div>
          <Select value={venue} onValueChange={setVenue}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venueOpts.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOpts.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net spend</div>
            <div className="mt-1 text-2xl font-semibold td-num">{fmtMoney(totalSpend)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{periodLabel}</div>
          </CardContent>
        </Card>
        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">vs prior period</div>
            <div className={`mt-1 text-2xl font-semibold td-num flex items-center gap-1 ${changePct >= 0 ? "text-red-400" : "text-emerald-400"}`}>
              {changePct >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {fmtPct(changePct)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">prior {fmtMoney(priorSpend)}</div>
          </CardContent>
        </Card>
        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Top category</div>
            <div className="mt-1 text-2xl font-semibold td-num truncate">{topCategory?.name || "—"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {topCategory ? `${fmtMoney(topCategory.current)} · ${totalSpend > 0 ? ((topCategory.current / totalSpend) * 100).toFixed(1) : "0.0"}% of total` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Items purchased</div>
            <div className="mt-1 text-2xl font-semibold td-num">{distinctProducts.toLocaleString()}</div>
            <div className="mt-1 text-xs text-muted-foreground">across {distinctSuppliers} suppliers</div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Category breakdown + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-3">
        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Spend by category</div>
            {categoryAgg.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No spend in this period.</div>
            ) : (
              <div className="space-y-3">
                {categoryAgg.map((c) => {
                  const wCur = (c.current / maxCatSpend) * 100;
                  const wPrv = (c.prior / maxCatSpend) * 100;
                  return (
                    <button
                      type="button"
                      key={c.name}
                      onClick={() => setSelectedCategory(c.name)}
                      className="w-full text-left rounded-md p-2 -m-2 hover:bg-primary/5 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="td-num text-muted-foreground">{fmtMoney(c.current)}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${wCur}%`, backgroundColor: c.color }} />
                        </div>
                        <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${wPrv}%`, backgroundColor: c.color, opacity: 0.4 }} />
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        <span style={{ color: c.color }}>■</span> This period: {fmtMoney(c.current)} · <span style={{ color: c.color, opacity: 0.6 }}>■</span> Last period: {fmtMoney(c.prior)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-glass">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Spend trend</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: AMBER }} />Total</span>
                {categoryAgg.slice(0, 2).map((c) => (
                  <span key={c.name} className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />{c.name}</span>
                ))}
              </div>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => fmtMoney(v)} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={AMBER} strokeWidth={2} dot={{ r: 3 }} />
                  {categoryAgg.slice(0, 2).map((c) => (
                    <Line key={c.name} type="monotone" dataKey={c.name} stroke={c.color} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Top items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Top items by spend</div>
            <span className="text-xs text-muted-foreground">Showing top {topItems.length} of {itemAgg.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU" className="h-9 pl-7 w-[220px] text-xs" />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCSV(
                  topItems.map((r) => ({
                    sku: r.sku, name: r.name, category: r.category,
                    qty: r.qty, net_spend: r.spend.toFixed(2),
                    pct_of_total: r.pctOfTotal.toFixed(2),
                    vs_prior_pct: r.change.toFixed(2),
                    avg_cost: r.avgCost.toFixed(2),
                  })),
                  [
                    { key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "category", label: "Category" },
                    { key: "qty", label: "Qty" }, { key: "net_spend", label: "Net spend" },
                    { key: "pct_of_total", label: "% of total" }, { key: "vs_prior_pct", label: "vs prior %" },
                    { key: "avg_cost", label: "Avg cost" },
                  ],
                  "purchase_analysis_top_items",
                )
              }
              className="h-9"
            >
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>

        <div className="card-glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 900 }}>
              <div className="grid bg-primary text-primary-foreground text-[12px] font-semibold sticky top-0 z-10" style={{ gridTemplateColumns: GRID }}>
                <div className="px-2 py-2.5 text-center">#</div>
                <div className="px-3 py-2.5">SKU</div>
                <div className="px-3 py-2.5">Item</div>
                <div className="px-3 py-2.5">Category</div>
                <div className="px-3 py-2.5 text-right">Qty</div>
                <div className="px-3 py-2.5 text-right">Net spend</div>
                <div className="px-3 py-2.5 text-right">% total</div>
                <div className="px-3 py-2.5 text-right">vs prior</div>
                <div className="px-3 py-2.5 text-right">Avg cost</div>
              </div>
              <div ref={scrollRef} className="overflow-auto" style={{ height: Math.min(720, Math.max(180, topItems.length * 36 + 4)) }}>
                {topItems.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">{loading ? "Loading…" : "No items in this period."}</div>
                ) : (
                  <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
                    {virtualizer.getVirtualItems().map((vRow) => {
                      const r = topItems[vRow.index];
                      const idx = vRow.index;
                      return (
                        <div
                          key={`${r.id}-${idx}`}
                          className={`grid items-center border-b border-border/40 text-[12px] hover:bg-primary/5 hover:border-l-[3px] hover:border-l-amber-500 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                          style={{
                            gridTemplateColumns: GRID,
                            position: "absolute", top: 0, left: 0, width: "100%",
                            height: vRow.size, transform: `translateY(${vRow.start}px)`,
                          }}
                        >
                          <div className="px-2 text-center text-muted-foreground">{idx + 1}</div>
                          <div className="px-3 font-mono text-muted-foreground truncate">{r.sku}</div>
                          <div className="px-3 font-medium truncate">{r.name}</div>
                          <div className="px-3 truncate"><Badge variant="outline" className="text-[10px]">{r.category}</Badge></div>
                          <div className="px-3 text-right tabular-nums">{r.qty.toLocaleString()}</div>
                          <div className="px-3 text-right tabular-nums font-semibold">{fmtMoney(r.spend)}</div>
                          <div className="px-3 text-right tabular-nums">{r.pctOfTotal.toFixed(1)}%</div>
                          <div className={`px-3 text-right tabular-nums ${r.priorSpend === 0 ? "text-muted-foreground" : r.change >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {r.priorSpend === 0 ? "—" : fmtPct(r.change)}
                          </div>
                          <div className="px-3 text-right tabular-nums text-muted-foreground">{fmtMoney2(r.avgCost)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Supplier concentration */}
      <Card className="card-glass">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Supplier concentration</div>
            <div className="text-xs text-muted-foreground">Top 3 suppliers = <span className="font-semibold text-foreground">{top3SupplierPct.toFixed(1)}%</span> of spend</div>
          </div>
          {supplierAgg.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No supplier activity in this period.</div>
          ) : (
            <div className="space-y-1.5">
              {supplierAgg.slice(0, 10).map((s, i) => {
                const isTop3 = i < 3;
                const w = (s.spend / maxSupplierSpend) * 100;
                const pct = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
                const change = s.prior > 0 ? ((s.spend - s.prior) / s.prior) * 100 : 0;
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSelectedSupplier({ id: s.id, name: s.name })}
                    className={`w-full text-left flex items-center gap-3 py-1.5 px-2 rounded hover:bg-primary/5 transition-colors ${isTop3 ? "bg-amber-500/5" : ""}`}
                  >
                    <div className="w-[120px] text-xs font-medium truncate">{s.name}</div>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: isTop3 ? AMBER : "hsl(var(--muted-foreground))" }} />
                    </div>
                    <div className="w-[70px] text-right text-xs tabular-nums font-semibold">{fmtMoney(s.spend)}</div>
                    <div className="w-[48px] text-right text-xs tabular-nums text-muted-foreground">{pct.toFixed(1)}%</div>
                    <div className={`w-[56px] text-right text-xs tabular-nums ${s.prior === 0 ? "text-muted-foreground" : change >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {s.prior === 0 ? "—" : fmtPct(change)}
                    </div>
                    <div className="w-[40px] text-right text-[10px] text-muted-foreground">{s.grnCount} GRN</div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplier drill-down */}
      <Sheet open={!!selectedSupplier} onOpenChange={(o) => !o && setSelectedSupplier(null)}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedSupplier?.name}</SheetTitle>
            <SheetDescription>
              {supplierGrns.length} GRN{supplierGrns.length === 1 ? "" : "s"} · {fmtMoney(supplierGrns.reduce((s, g) => s + g.spend, 0))} spend · {periodLabel}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 card-glass rounded-xl overflow-hidden">
            <div className="grid bg-primary text-primary-foreground text-[12px] font-semibold" style={{ gridTemplateColumns: "110px 1fr 60px 80px 100px" }}>
              <div className="px-3 py-2">Date</div>
              <div className="px-3 py-2">Venue</div>
              <div className="px-3 py-2 text-right">Lines</div>
              <div className="px-3 py-2 text-right">Qty</div>
              <div className="px-3 py-2 text-right">Spend</div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {supplierGrns.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No GRNs.</div>
              ) : supplierGrns.map((g, i) => (
                <div key={g.grnId} className={`grid items-center text-[12px] border-b border-border/40 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`} style={{ gridTemplateColumns: "110px 1fr 60px 80px 100px" }}>
                  <div className="px-3 py-2 tabular-nums">{g.date ? new Date(g.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</div>
                  <div className="px-3 py-2 truncate">{g.venue || "—"}</div>
                  <div className="px-3 py-2 text-right tabular-nums">{g.lines}</div>
                  <div className="px-3 py-2 text-right tabular-nums">{g.qty.toLocaleString()}</div>
                  <div className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(g.spend)}</div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Category drill-down */}
      <Dialog open={!!selectedCategory} onOpenChange={(o) => !o && setSelectedCategory(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedCategory}</DialogTitle>
            <DialogDescription>
              {categoryItems.length} item{categoryItems.length === 1 ? "" : "s"} · {fmtMoney(categoryTotalSpend)} spend · {periodLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="card-glass rounded-xl overflow-hidden">
            <div className="grid bg-primary text-primary-foreground text-[12px] font-semibold" style={{ gridTemplateColumns: "90px 1fr 70px 100px 70px" }}>
              <div className="px-3 py-2">SKU</div>
              <div className="px-3 py-2">Item</div>
              <div className="px-3 py-2 text-right">Qty</div>
              <div className="px-3 py-2 text-right">Spend</div>
              <div className="px-3 py-2 text-right">% cat</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {categoryItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No items.</div>
              ) : categoryItems.map((r, i) => (
                <div key={r.id} className={`grid items-center text-[12px] border-b border-border/40 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`} style={{ gridTemplateColumns: "90px 1fr 70px 100px 70px" }}>
                  <div className="px-3 py-2 font-mono text-muted-foreground truncate">{r.sku}</div>
                  <div className="px-3 py-2 truncate">{r.name}</div>
                  <div className="px-3 py-2 text-right tabular-nums">{r.qty.toLocaleString()}</div>
                  <div className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.spend)}</div>
                  <div className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.pct.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
