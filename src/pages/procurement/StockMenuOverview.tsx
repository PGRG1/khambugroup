import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { useBaniAsk } from "@/components/assistant/FloatingBaniContext";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { Button } from "@/components/ui/button";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { formatCurrency, formatPercent, formatDecimal } from "@/utils/format";

const card = "card-glass rounded-xl p-3 sm:p-4 min-w-0";
const num = (v: unknown) => Number(v) || 0;
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const monthShort = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
const monthLong = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });
const k = (v: number) => `${formatDecimal(v / 1000, 1)}k`;
const isDrink = (c?: string | null) => /bev|drink|wine|spirit|beer/i.test(c ?? "");

type Session = { id: string; count_date: string };
type CountItem = { session_id: string; product_master_id: string; counted_qty: number | null; unit: string | null; unit_cost: number | null };
type Product = { id: string; internal_product_name: string; level1_category: string | null; level2_category: string | null; supplier: string | null };

/** Stock & menu overview: stock on hand from month-end counts, what it's made of, prices rising, menu costing status. */
export default function StockMenuOverview() {
  const { tenantId } = useActiveTenant();
  const navigate = useNavigate();
  const ask = useBaniAsk();

  const q = useQuery({
    queryKey: ["stock-menu-overview", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const db = supabase as any;
      const [sessions, items, products, invoices, lines, sales, menu] = await Promise.all([
        db.from("stock_count_sessions").select("id,count_date").eq("tenant_id", tenantId).eq("status", "approved").order("count_date"),
        fetchAllRows("stock_count_items", "session_id,product_master_id,counted_qty,unit,unit_cost", undefined, tenantId, true),
        fetchAllRows("product_master", "id,internal_product_name,level1_category,level2_category,supplier", undefined, tenantId, true),
        fetchAllRows("invoices", "id,invoice_date,total_amount,voided_at", undefined, tenantId, true),
        fetchAllRows("invoice_line_items", "invoice_id,product_master_id,quantity,total", undefined, tenantId, true),
        fetchAllRows("sales_records", "date,subtotal,service_charge", undefined, tenantId, true),
        db.from("menu_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);
      if (sessions.error) throw sessions.error;
      return {
        sessions: (sessions.data ?? []) as Session[], items: items as CountItem[], products: products as Product[],
        invoices: (invoices as any[]).filter((i) => !i.voided_at), lines: lines as any[], sales: sales as any[], menuCount: menu.count ?? 0,
      };
    },
  });

  const data = q.data;
  const period = usePagePeriod((data?.sessions ?? []).map((s) => s.count_date), "mtd", "month");

  const view = useMemo(() => {
    if (!data) return null;
    const prod = new Map(data.products.map((p) => [p.id, p]));
    const value = (sid: string) => data.items.filter((i) => i.session_id === sid).reduce((a, i) => a + num(i.counted_qty) * num(i.unit_cost), 0);
    // One count per month: the latest in that month.
    const byMonth = new Map<string, Session>();
    for (const s of data.sessions) byMonth.set(s.count_date.slice(0, 7), s);
    const counts = [...byMonth.values()].sort((a, b) => a.count_date.localeCompare(b.count_date));
    const monthEnd = `${period.month}-31`;
    const cur = [...counts].reverse().find((s) => s.count_date <= monthEnd) ?? null;
    if (!cur) return { cur: null } as const;
    const prev = [...counts].reverse().find((s) => s.count_date < cur.count_date) ?? null;
    const m = cur.count_date.slice(0, 7);
    const curItems = data.items.filter((i) => i.session_id === cur.id).map((i) => {
      const p = prod.get(i.product_master_id);
      return { name: p?.internal_product_name ?? "Item", group: isDrink(p?.level1_category) ? "Drinks" : "Food", type: p?.level2_category || p?.level1_category || "Other",
        qty: num(i.counted_qty), unit: i.unit ?? "", value: num(i.counted_qty) * num(i.unit_cost), pid: i.product_master_id };
    });
    const total = curItems.reduce((a, i) => a + i.value, 0);
    const food = curItems.filter((i) => i.group === "Food").reduce((a, i) => a + i.value, 0);
    const prevTotal = prev ? value(prev.id) : null;
    const bought = data.invoices.filter((i) => String(i.invoice_date).slice(0, 7) === m).reduce((a, i) => a + num(i.total_amount), 0);
    const salesM = data.sales.filter((s) => String(s.date).slice(0, 7) === m).reduce((a, s) => a + num(s.subtotal) + num(s.service_charge), 0);
    const used = prevTotal != null ? prevTotal + bought - total : null;
    const dim = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    const days = used && used > 0 ? total / (used / dim) : null;
    // Breakdown by type, compared with the count before.
    const prevByType = new Map<string, number>();
    if (prev) for (const i of data.items.filter((x) => x.session_id === prev.id)) {
      const p = prod.get(i.product_master_id); const t = p?.level2_category || p?.level1_category || "Other";
      prevByType.set(t, (prevByType.get(t) ?? 0) + num(i.counted_qty) * num(i.unit_cost));
    }
    const types = [...new Set(curItems.map((i) => i.type))].map((t) => {
      const rows = curItems.filter((i) => i.type === t); const v = rows.reduce((a, i) => a + i.value, 0); const pv = prevByType.get(t);
      return { name: t, group: rows[0].group, items: rows.length, value: v, change: pv ? ((v - pv) / pv) * 100 : null };
    }).sort((a, b) => b.value - a.value);
    const chart = counts.filter((s) => s.count_date <= cur.count_date).slice(-6).map((s) => {
      const rows = data.items.filter((i) => i.session_id === s.id);
      const f = rows.filter((i) => !isDrink(prod.get(i.product_master_id)?.level1_category)).reduce((a, i) => a + num(i.counted_qty) * num(i.unit_cost), 0);
      const all = rows.reduce((a, i) => a + num(i.counted_qty) * num(i.unit_cost), 0);
      return { label: monthShort(s.count_date), food: f, drinks: all - f, total: all };
    });
    // Price watch: latest price vs what was usually paid in the 60 days before it.
    const invDate = new Map(data.invoices.map((i) => [i.id, String(i.invoice_date)]));
    const byProd = new Map<string, { d: string; q: number; t: number }[]>();
    for (const l of data.lines) {
      const d = invDate.get(l.invoice_id); if (!d || !l.product_master_id || num(l.quantity) <= 0) continue;
      const arr = byProd.get(l.product_master_id) ?? []; arr.push({ d, q: num(l.quantity), t: num(l.total) }); byProd.set(l.product_master_id, arr);
    }
    const today = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const rises = [...byProd.entries()].flatMap(([pid, arr]) => {
      arr.sort((a, b) => a.d.localeCompare(b.d));
      const last = arr[arr.length - 1]; if (last.d < recent || last.d > today) return [];
      const from = new Date(new Date(`${last.d}T00:00:00`).getTime() - 60 * 864e5).toISOString().slice(0, 10);
      const before = arr.filter((x) => x.d < last.d && x.d >= from); const bq = before.reduce((a, x) => a + x.q, 0); if (!bq) return [];
      const usual = before.reduce((a, x) => a + x.t, 0) / bq, now = last.t / last.q, pct = (now / usual - 1) * 100;
      const spend = arr.filter((x) => x.d.slice(0, 7) === m).reduce((a, x) => a + x.t, 0);
      const p = prod.get(pid);
      return pct > 5 ? [{ name: p?.internal_product_name ?? "Item", supplier: p?.supplier ?? "", date: last.d, now, usual, pct, spend }] : [];
    }).sort((a, b) => b.pct - a.pct);
    return { cur, prev, m, total, food, drinks: total - food, prevTotal, used, salesM, days, types, chart, top: [...curItems].sort((a, b) => b.value - a.value).slice(0, 5), rises, items: curItems };
  }, [data, period.month]);

  const pctOf = (v: number, t: number) => (t > 0 ? `${Math.round((v / t) * 100)}%` : "—");

  return (
    <div className="kit p-4 sm:p-6 space-y-4 min-w-0 max-w-full overflow-x-clip">
      <RevenuePageTop title="Stock & menu" actionsBesideTitle actions={<Button onClick={() => navigate("/procurement/stock-counts")}>Count stock</Button>} />
      <div className="flex flex-wrap justify-between items-center gap-2">{period.control}
        <Button variant="outline" size="icon" aria-label="Download stock count" disabled={!view?.cur}
          onClick={() => view && "items" in view && downloadCSV(view.items.map((i) => ({ name: i.name, type: i.type, qty: i.qty, unit: i.unit, value: Math.round(i.value) })),
            [{ key: "name", label: "Item" }, { key: "type", label: "Type" }, { key: "qty", label: "Counted" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }], "stock-on-hand")}>
          <Download className="w-4 h-4" /></Button></div>
      {q.isLoading ? <p>Loading stock…</p> : q.error ? <p role="alert">Stock could not be loaded: {(q.error as Error).message}</p>
        : !view?.cur ? <section className={card}><p className="text-sm">No stock count yet. Count your stock and this page shows what you hold and what it's made of.</p>
          <Button className="mt-3" onClick={() => navigate("/procurement/stock-counts")}>Count stock</Button></section>
        : "items" in view && <>
          <section className="glass-surface border border-border rounded-lg px-4 py-3" aria-label="Bani findings">
            <div className="flex items-center gap-2 mb-1"><BaniOrb size={24} mode="idle" /><h2 className="font-display font-semibold text-sm">Bani</h2></div>
            {view.rises.slice(0, 2).map((r) => (
              <div key={r.name} className="py-1 text-sm flex flex-wrap items-baseline gap-x-3">
                <span className="flex-1 min-w-0"><b>{r.name} went up {formatDecimal(r.pct, 1)}%.</b> {r.supplier ? `${r.supplier} charged` : "Charged"} {formatCurrency(r.now)} on {dayLabel(r.date)}, usually {formatCurrency(r.usual)}.{r.spend > 0 ? ` You spent ${formatCurrency(r.spend)} on it in ${monthLong(view.m)}.` : ""}</span>
                <Button variant="link" className="h-auto p-0 text-xs" onClick={() => ask(`Why did ${r.name} go up ${formatDecimal(r.pct, 1)}%, and what should I do?`)}>Ask why</Button>
              </div>))}
            {data?.menuCount === 0 && <div className="py-1 text-sm flex flex-wrap items-baseline gap-x-3 text-muted-foreground">
              <span className="flex-1 min-w-0">No dishes costed yet, so I can't tell which dishes make money. Send me your menu and I'll cost each dish from your invoice prices.</span>
              <Button variant="link" className="h-auto p-0 text-xs" onClick={() => ask("Help me cost my menu")}>Cost menu</Button></div>}
            {!view.rises.length && data?.menuCount !== 0 && <p className="text-sm text-muted-foreground">Nothing needs a look.</p>}
          </section>

          <section className={card}>
            <p className="text-sm text-muted-foreground">Stock on hand · counted {dayLabel(view.cur.count_date)}, {view.items.length} items</p>
            <p className="text-4xl td-num font-semibold mt-1">{formatCurrency(view.total)}</p>
            <p className="text-sm mt-2">{view.days != null ? `${formatDecimal(view.days, 1)} days of stock at ${monthLong(view.m)}'s pace` : "Days of stock shows after two counts"}
              {view.prevTotal != null ? ` · ${formatCurrency(Math.abs(view.total - view.prevTotal))} ${view.total < view.prevTotal ? "less" : "more"} than the count before` : ""}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 border-t border-border pt-4">
              <div><p className="text-sm text-muted-foreground">Food</p><p className="td-num mt-1 font-semibold">{formatCurrency(view.food)}</p><p className="text-xs text-muted-foreground">{pctOf(view.food, view.total)}</p></div>
              <div><p className="text-sm text-muted-foreground">Drinks</p><p className="td-num mt-1 font-semibold">{formatCurrency(view.drinks)}</p><p className="text-xs text-muted-foreground">{pctOf(view.drinks, view.total)}</p></div>
              <div><p className="text-sm text-muted-foreground">Used in {monthLong(view.m)}</p><p className="td-num mt-1 font-semibold">{view.used != null ? formatCurrency(view.used) : "—"}</p>
                <p className="text-xs text-muted-foreground">{view.used != null && view.salesM > 0 ? `${formatPercent((view.used / view.salesM) * 100)} of sales · ` : ""}opening + bought − closing</p></div>
            </div>
          </section>

          {view.chart.length > 0 && <section className={card}>
            <h2 className="font-display font-semibold mb-4">Stock on hand at each count</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={view.chart} margin={{ top: 24, right: 20, left: 10, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(n) => `${formatDecimal(n / 1000, 0)}k`} width={44} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="food" name="Food" stackId="s" fill="#2C5A52" />
                <Bar dataKey="drinks" name="Drinks" stackId="s" fill="#8FC1A9" radius={[4, 4, 0, 0]}><LabelList dataKey="total" position="top" formatter={(v: number) => k(v)} className="text-xs" /></Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-xs text-muted-foreground mt-2"><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#2C5A52" }} />Food</span><span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: "#8FC1A9" }} />Drinks</span></div>
          </section>}

          <section className={card}>
            <h2 className="font-display font-semibold mb-3">By type <span className="text-sm font-normal text-muted-foreground">{dayLabel(view.cur.count_date)} count · {formatCurrency(view.total)}</span></h2>
            {view.types.map((t) => (
              <div key={t.name} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[200px_minmax(0,1fr)_170px_90px] items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0 truncate">{t.name} <span className="text-xs text-muted-foreground">{t.items} {t.items === 1 ? "item" : "items"} · {t.group.toLowerCase()}</span></span>
                <span className="hidden sm:block h-2 rounded bg-muted overflow-hidden"><span className="block h-full" style={{ width: `${(t.value / Math.max(1, view.types[0].value)) * 100}%`, background: t.group === "Drinks" ? "#8FC1A9" : "#2C5A52" }} /></span>
                <span className="td-num text-right">{formatCurrency(t.value)} · {pctOf(t.value, view.total)}</span>
                <span className="hidden sm:block td-num text-right text-xs text-muted-foreground">{t.change == null ? "" : `${t.change > 0 ? "+" : ""}${Math.round(t.change)}% vs before`}</span>
              </div>))}
          </section>

          <div className="grid gap-4 lg:grid-cols-2 min-w-0">
            <section className={card}>
              <h2 className="font-display font-semibold mb-2">Where the money sits</h2>
              {view.top.map((i) => <div key={i.pid} className="flex gap-2 py-2 border-t border-border first:border-t-0 text-sm">
                <span className="min-w-0 truncate">{i.name} <span className="text-muted-foreground">{formatDecimal(i.qty, 1)} {i.unit}</span></span><span className="ml-auto td-num">{formatCurrency(i.value)}</span></div>)}
            </section>
            <section className={card}>
              <h2 className="font-display font-semibold mb-2">Menu costs</h2>
              {data?.menuCount ? <p className="text-sm">{data.menuCount} {data.menuCount === 1 ? "dish" : "dishes"} costed. <Link className="underline" to="/procurement/menu-costing">See menu costs</Link></p>
                : <><p className="text-sm text-muted-foreground">No dishes costed yet. Once your menu is in, this shows each dish's cost, its price and what it makes.</p>
                  <Button variant="outline" className="mt-3" onClick={() => ask("Help me cost my menu")}>Cost my menu with Bani</Button></>}
            </section>
          </div>
        </>}
    </div>
  );
}
