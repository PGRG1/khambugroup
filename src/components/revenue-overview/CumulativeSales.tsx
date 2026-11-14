import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { baseSymbol } from "@/utils/money";
import { shortMoney } from "@/utils/revenueOverview";
import { fmtHKD } from "./utils";

export interface CumulativeDay {
  date: string;
  /** Real sales for the day; null when nothing is recorded (yet). */
  actual: number | null;
  /** The day's projection (manager figure, else Bani's same-weekday forecast); null when none. */
  forecast: number | null;
}

interface Props {
  /** Every day of one month, in order. */
  days: CumulativeDay[];
  /** Last day counted as sold (today, or yesterday if today has no sales yet). */
  lastCounted: string;
  /** Month target, when one is set. */
  target: number | null;
}

/**
 * Month sales added up day by day: a solid line for what has been sold, continued by a dotted
 * line to month end using each remaining day's projection. Days without a projection use the
 * month's average sold day so far.
 */
export function CumulativeSales({ days, lastCounted, target }: Props) {
  const model = useMemo(() => {
    const sold = days.filter((d) => d.date <= lastCounted);
    const soldDays = sold.filter((d) => (d.actual ?? 0) > 0).length;
    const soldTotal = sold.reduce((s, d) => s + (d.actual ?? 0), 0);
    const avgDay = soldDays ? soldTotal / soldDays : 0;
    let run = 0;
    const points = days.map((d) => {
      const day = Number(d.date.slice(8, 10));
      const label = new Date(`${d.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      if (d.date <= lastCounted) {
        run += d.actual ?? 0;
        return { date: d.date, day, label, actual: run, projected: d.date === lastCounted ? run : null as number | null };
      }
      run += d.forecast ?? avgDay;
      return { date: d.date, day, label, actual: null as number | null, projected: run };
    });
    const future = days.some((d) => d.date > lastCounted);
    return { points, soldTotal, endTotal: run, future };
  }, [days, lastCounted]);

  const ticks = model.points.filter((p) => [1, 8, 15, 22, 29].includes(p.day)).map((p) => p.label);
  const lastLabel = model.points.find((p) => p.date === lastCounted)?.label;
  // Round axis steps (e.g. 0, 200k, 400k, 600k) with headroom above the highest line.
  const peak = Math.max(model.endTotal, target ?? 0) * 1.08 || 1;
  const raw = peak / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  const yTicks = Array.from({ length: Math.ceil(peak / step) + 1 }, (_, i) => i * step);
  const top = yTicks[yTicks.length - 1];
  const short = target != null && model.future && model.endTotal < target;

  const tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums">
      <div className="mb-1 font-medium">{label}</div>
      <div className="text-muted-foreground">{p.actual != null ? "Actual" : "Projected"}</div>
      <div className="text-foreground">{baseSymbol()}{fmtHKD(p.actual ?? p.projected)}</div>
    </div>;
  };

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="text-[13px] font-medium">Running total</div>
      {/* The figures double as the legend: solid line = actual, dotted line = projected. */}
      <div className="mt-1.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">
        <span className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden="true"><line x1="0" x2="14" y1="2" y2="2" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg>
          <span className="text-muted-foreground">{model.future ? "Actual" : "Total"}</span><b className="font-semibold">{shortMoney(model.soldTotal)}</b></span>
        {model.future && <span className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden="true"><line x1="0" x2="14" y1="2" y2="2" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="3 3" /></svg>
          <span className="text-muted-foreground">Projected</span><b className="font-semibold" style={target ? { color: short ? "#B45309" : "#15803D" } : undefined}>{shortMoney(model.endTotal)}</b></span>}
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={model.points} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" ticks={ticks} interval={0} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, top]} ticks={yTicks} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHKD(v as number, true)} width={48} />
            <Tooltip content={tip} />
            {target ? <ReferenceLine y={target} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: `Target ${shortMoney(target)}`, position: "insideTopLeft", fontSize: 11, fill: "hsl(var(--muted-foreground))", offset: 6 }} /> : null}
            <Area type="monotone" dataKey="actual" stroke="none" fill="url(#cumFill)" isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false}>
              <LabelList dataKey="actual" content={(p: any) => p.index === model.points.findIndex((x) => x.label === lastLabel) && p.value != null
                ? <g><circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={2} /></g> : null} />
            </Line>
            {model.future && (
              <Line type="monotone" dataKey="projected" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 5" dot={false} isAnimationActive={false} connectNulls>
                <LabelList dataKey="projected" content={(p: any) => p.index === model.points.length - 1 && p.value != null
                  ? <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="hsl(var(--primary))" strokeWidth={2} /> : null} />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
