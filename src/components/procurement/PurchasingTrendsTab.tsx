import { useMemo } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageTop } from "@/components/kit/PageTop";
import { RevenueEnter, barBuild, lineBuild, useSlowLoad } from "@/components/revenue/RevenueMotion";
import { usePurchasingData } from "@/hooks/usePurchasingData";
import { usePurchasingMode } from "@/hooks/usePurchasingMode";
import { useVenueScope } from "@/hooks/useVenueScope";
import { purchasingOverviewRows } from "@/utils/purchasingMode";
import { hongKongDate } from "@/utils/purchasingOverview";
import { purchasingTrends, type TrendSeries } from "@/utils/purchasingTrends";
import { shortMoney } from "@/utils/revenueOverview";
import { fmtHKD } from "@/components/revenue-overview/utils";
import { baseSymbol } from "@/utils/money";
import { useIsMobile } from "@/hooks/use-mobile";
import { BandCursor } from "@/components/charts/BandCursor";

// Same look as Revenue's Trends: cards, keys with values, light grid, months along the bottom.
const PRIMARY = "hsl(var(--primary))";
const WARM = "hsl(var(--chart-7))";
const MUTED = "hsl(var(--muted-foreground))";
const GRID = { stroke: "hsl(var(--border))", strokeOpacity: 0.3, strokeDasharray: "2 4", vertical: false } as const;
const AXIS = { tick: { fontSize: 11, fill: MUTED }, axisLine: false, tickLine: false } as const;
const green = "#15803D", amber = "#B45309";
const SERIES = [PRIMARY, "hsl(var(--chart-2))", "hsl(var(--chart-7))", "hsl(var(--chart-5))", "hsl(var(--chart-6))"];
const monthShort = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" }).slice(0, 3);
const monthLong = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function niceTicks(max: number, n = 4) {
  const peak = max * 1.08 || 1;
  const raw = peak / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  return Array.from({ length: Math.ceil(peak / step) + 1 }, (_, i) => i * step);
}

function Card({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card-glass rounded-xl border border-border/60 p-4 min-w-0">
      <h2 className="text-[13px] font-medium truncate" title={title}>{title}</h2>
      {legend && <div className="mt-1.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">{legend}</div>}
      {children}
    </section>
  );
}

function Key({ kind, label, value, color }: { kind: "bar" | "line" | "warm"; label: string; value?: string; color?: string }) {
  const swatch = kind === "bar" ? <rect x="0" y="0" width="10" height="10" rx="2" fill={PRIMARY} fillOpacity={0.85} />
    : <line x1="0" x2="14" y1="5" y2="5" stroke={kind === "warm" ? WARM : PRIMARY} strokeWidth="2.5" />;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width={kind === "bar" ? 10 : 14} height="10" aria-hidden="true">{swatch}</svg>
      <span className="text-muted-foreground">{label}</span>
      {value && <b className="font-semibold" style={color ? { color } : undefined}>{value}</b>}
    </span>
  );
}

const Tip = ({ rows }: { rows: [string, string][] }) => (
  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums space-y-0.5">
    {rows.map(([k, v], i) => i === 0 ? <div key={k} className="font-medium mb-1">{k}</div>
      : <div key={k} className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>)}
  </div>
);

/** Twelve small bars, this month (so far) lighter: one series of categories or suppliers. */
function MonthBars({ s, months, current, play, card }: { s: TrendSeries; months: string[]; current: string; play: boolean; card: number }) {
  const rows = months.map((m, i) => ({ key: m, label: monthShort(m).slice(0, 1), v: s.months[i] }));
  return (
    <section className="card-glass rounded-xl border border-border/60 p-3 sm:p-4 min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-1.5 text-[12px] sm:text-[13px]">
        <h3 className="font-medium truncate min-w-0" title={s.group ? `${s.group} · ${s.name}` : s.name}>{s.name}</h3>
        <b className="font-semibold tabular-nums shrink-0">{shortMoney(s.total)}</b>
      </div>
      <div style={{ width: "100%", height: 120 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="label" interval={0} {...AXIS} tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip cursor={<BandCursor count={12} />} content={({ active, payload }: any) => active && payload?.length
              ? <Tip rows={[[monthLong(payload[0].payload.key), ""], [payload[0].payload.key === current ? "So far" : "Spend", payload[0].payload.v == null ? "Nothing" : shortMoney(payload[0].payload.v)]]} /> : null} />
            <Bar dataKey="v" radius={[2, 2, 0, 0]} {...barBuild(play, card)}>
              {rows.map((r) => <Cell key={r.key} fill={PRIMARY} fillOpacity={r.key === current ? 0.35 : 0.85} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Five names stacked in one bar per month; below, each one's 12-month total and share of all spend. */
function MonthLines({ title, rows, total, months, current, play, mobile }: { title: string; rows: TrendSeries[]; total: number; months: string[]; current: string; play: boolean; mobile: boolean }) {
  const data = months.map((m, i) => ({ key: m, label: mobile ? monthShort(m).slice(0, 1) : monthShort(m), ...Object.fromEntries(rows.map((r, j) => [`s${j}`, r.months[i] ?? 0])) }));
  const ticks = niceTicks(Math.max(1, ...months.map((_, i) => rows.reduce((n, r) => n + Math.max(0, r.months[i] ?? 0), 0))));
  return (
    <Card title={title}>
      <div className="mt-2" style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" interval={0} {...AXIS} tick={{ fontSize: 10, fill: MUTED }} />
            <YAxis domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={(v) => fmtHKD(v as number, true)} width={44} {...AXIS} />
            <Tooltip cursor={<BandCursor count={12} />} content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null; const p = payload[0].payload;
              const total = rows.reduce((n, _, j) => n + (p[`s${j}`] || 0), 0);
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums">
                  <div className="font-medium mb-1">{monthLong(p.key)}{p.key === current ? " (so far)" : ""}</div>
                  {rows.map((r, j) => ({ r, j })).reverse().map(({ r, j }) => (
                    <div key={r.id} className="flex items-center justify-between gap-4 py-px">
                      <span className="flex items-center gap-1.5 min-w-0 text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES[j] }} /><span className="truncate max-w-[200px]">{r.name}</span></span>
                      <span>{p[`s${j}`] ? shortMoney(p[`s${j}`]) : "—"}</span>
                    </div>
                  ))}
                  <div className="mt-1 pt-1 border-t border-border/60 flex justify-between gap-4 font-medium"><span>Total</span><span>{shortMoney(total)}</span></div>
                </div>
              );
            }} />
            {rows.map((r, j) => <Bar key={r.id} dataKey={`s${j}`} stackId="top" fill={SERIES[j]} radius={j === rows.length - 1 ? [2, 2, 0, 0] : 0} {...barBuild(play, 3)}>
              {data.map((d) => <Cell key={d.key} fillOpacity={d.key === current ? 0.4 : 0.9} />)}
            </Bar>)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-[12px] tabular-nums">
        <thead><tr className="text-muted-foreground">
          <th className="text-left font-normal pb-1" />
          <th className="text-right font-normal pb-1 w-20">12 months</th>
          <th className="text-right font-normal pb-1 w-14">Share</th>
        </tr></thead>
        <tbody>{rows.map((r, j) => (
          <tr key={r.id} className="border-t border-border/40">
            <td className="py-1.5 pr-2 max-w-0"><span className="flex items-center gap-2 min-w-0"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES[j] }} /><span className="truncate" title={r.name}>{r.name}</span></span></td>
            <td className="py-1.5 text-right font-medium">{shortMoney(r.total)}</td>
            <td className="py-1.5 text-right text-muted-foreground">{total > 0 ? `${Math.round(r.total / total * 100)}%` : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}

export default function PurchasingTrendsTab() {
  const purchasing = usePurchasingMode();
  const scope = useVenueScope();
  const data = usePurchasingData(purchasing.tenantId);
  const current = hongKongDate().slice(0, 7);
  const t = useMemo(() => {
    if (!data.data) return null;
    const invoices = purchasingOverviewRows(data.data.invoices, purchasing.mode, scope.includesName).filter((row) => row.review_status !== "Draft");
    const ids = new Set(invoices.map((row) => row.id));
    return purchasingTrends({
      current, invoices, lines: data.data.lines.filter((line) => ids.has(line.invoice_id)),
      products: new Map(data.data.products.map((row) => [row.id, row])),
      sales: purchasingOverviewRows(data.data.sales, purchasing.mode, scope.includesName),
      supplierNames: new Map(data.data.suppliers.map((row) => [row.id, row.name])),
    });
  }, [data.data, purchasing.mode, scope.includesName, current]);
  const loading = !t || !purchasing.isSuccess || !scope.ready;
  const mobile = useIsMobile();
  const slow = useSlowLoad(loading);

  return (
    <div className="w-full mx-auto space-y-4">
      <PageTop title="Trends" />
      {data.isError ? <p className="text-sm text-warning">Could not load purchasing figures. Please reload to try again.</p>
        : loading ? (slow ? <div className="h-80 bg-muted/60 rounded-xl animate-pulse" /> : null)
        : <RevenueEnter id="purchasing-trends" className="space-y-4">{(play: boolean) => {
          const months = t.months;
          const now = t.monthly[t.monthly.length - 1];
          const spendTotal = t.monthly.reduce((n, m) => n + m.spend, 0);
          const ticks = niceTicks(Math.max(...t.monthly.map((m) => m.spend)));
          const pctTop = Math.max(10, Math.ceil(Math.max(0, ...t.monthly.map((m) => m.pct ?? 0)) / 5) * 5);
          const rows = t.monthly.map((m) => ({ ...m, label: mobile ? monthShort(m.key).slice(0, 1) : monthShort(m.key) }));
          return <>
            <Card title="Monthly spend" legend={<>
              <Key kind="bar" label={`${monthShort(now.key)} so far`} value={shortMoney(now.spend)} />
              <Key kind="warm" label="% of sales" value={now.pct == null ? "—" : `${Math.round(now.pct)}%`} />
            </>}>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" interval={0} {...AXIS} tick={{ fontSize: 10, fill: MUTED }} />
                    <YAxis yAxisId="money" domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={(v) => fmtHKD(v as number, true)} width={44} {...AXIS} />
                    <YAxis yAxisId="pct" orientation="right" domain={[0, pctTop]} tickFormatter={(v) => `${v}%`} width={34} {...AXIS} />
                    <Tooltip cursor={<BandCursor count={12} />} content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null; const p = payload[0].payload;
                      return <Tip rows={[[monthLong(p.key), ""], [p.key === current ? "So far" : "Spend", `${baseSymbol()}${fmtHKD(p.spend)}`], ["% of sales", p.pct == null ? "—" : `${p.pct.toFixed(1)}%`]]} />;
                    }} />
                    <Bar yAxisId="money" dataKey="spend" radius={[3, 3, 0, 0]} {...barBuild(play, 1)}>
                      {rows.map((r) => <Cell key={r.key} fill={PRIMARY} fillOpacity={r.key === current ? 0.35 : 0.85} />)}
                    </Bar>
                    <Line yAxisId="pct" dataKey="pct" type="monotone" stroke={WARM} strokeWidth={2} dot={{ r: 2.5, fill: WARM, strokeWidth: 0 }} connectNulls={false} {...lineBuild(play, 1, true)} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="pt-2 flex items-baseline justify-between"><h2 className="text-[15px] font-semibold">Categories</h2><span className="text-[12px] text-muted-foreground">Last 12 months</span></div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {t.categories.map((s, i) => <MonthBars key={s.id} s={s} months={months} current={current} play={play} card={2 + Math.min(i, 2)} />)}
            </div>

            <MonthLines title="Top 5 items" rows={t.items} total={spendTotal} months={months} current={current} play={play} mobile={mobile} />
            <MonthLines title="Top 5 suppliers" rows={t.suppliers} total={spendTotal} months={months} current={current} play={play} mobile={mobile} />
          </>;
        }}</RevenueEnter>}
    </div>
  );
}
