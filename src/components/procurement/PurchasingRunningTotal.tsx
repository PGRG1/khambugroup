import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { lineBuild, useRevenuePlay } from "@/components/revenue/RevenueMotion";
import { shortMoney } from "@/utils/revenueOverview";
import { fmtHKD } from "@/components/revenue-overview/utils";
import { baseSymbol } from "@/utils/money";
import { useIsMobile } from "@/hooks/use-mobile";
import { chartHeight } from "@/components/kit/chartSize";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface RunningDay { day: number; current: number | null; prior: number | null; budget: number | null }

/**
 * Purchasing's running total, drawn the same way as Revenue's: this month's spend added up day by
 * day (solid, shaded), last month as a thin light line and the budget as a grey dashed line.
 */
export function PurchasingRunningTotal({ month, days, currentName, priorName }: {
  /** "2026-11" */
  month: string; days: RunningDay[]; currentName: string; priorName: string | null;
}) {
  const play = useRevenuePlay();
  const mobile = useIsMobile();
  const model = useMemo(() => {
    const points = days.map((d) => {
      const date = `${month}-${String(d.day).padStart(2, "0")}`;
      return { ...d, label: `${d.day} ${MONTHS[Number(month.slice(5, 7)) - 1]}` };
    });
    const last = [...points].reverse().find((p) => p.current != null);
    const budget = [...points].reverse().find((p) => p.budget != null)?.budget ?? null;
    const priorAtLast = last ? points.find((p) => p.day === last.day)?.prior ?? null : null;
    return { points, last, budget, priorAtLast };
  }, [days, month]);

  const ticks = model.points.filter((p) => [1, 8, 15, 22, 29].includes(p.day)).map((p) => p.label);
  // Round axis steps; the top tick is the first one just above the highest line (no empty band).
  const highest = Math.max(1, ...model.points.flatMap((p) => [p.current ?? 0, p.prior ?? 0, p.budget ?? 0])) * 1.03;
  const raw = highest / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  const yTicks = Array.from({ length: Math.ceil(highest / step) + 1 }, (_, i) => i * step);
  const top = yTicks[yTicks.length - 1];

  const tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums space-y-0.5">
      <div className="mb-1 font-medium">{label}</div>
      {p.current != null && <div>{currentName} <b>{baseSymbol()}{fmtHKD(p.current)}</b></div>}
      {p.prior != null && priorName && <div className="text-muted-foreground">{priorName} {baseSymbol()}{fmtHKD(p.prior)}</div>}
      {p.budget != null && <div className="text-muted-foreground">Budget {baseSymbol()}{fmtHKD(p.budget)}</div>}
    </div>;
  };

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 max-sm:p-3.5">
      <div className="text-[13px] font-medium">Running total</div>
      {/* The figures double as the legend, as on Revenue. */}
      <div className="mt-1.5 mb-2 flex flex-nowrap items-center gap-x-3 overflow-hidden text-[11px] sm:text-[12px] tabular-nums">
        <span className="inline-flex items-center gap-1 whitespace-nowrap"><svg width="12" height="4" aria-hidden="true"><line x1="0" x2="12" y1="2" y2="2" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg>
          <span className="text-muted-foreground">{currentName}</span><b className="font-semibold">{shortMoney(model.last?.current ?? 0)}</b></span>
        {priorName && <span className="inline-flex items-center gap-1 whitespace-nowrap"><svg width="12" height="4" aria-hidden="true"><line x1="0" x2="12" y1="2" y2="2" stroke="hsl(var(--primary))" strokeOpacity="0.3" strokeWidth="2" /></svg>
          <span className="text-muted-foreground">{priorName}</span><b className="font-semibold">{shortMoney(model.priorAtLast ?? 0)}</b></span>}
        {model.budget != null && <span className="inline-flex items-center gap-1 whitespace-nowrap"><svg width="12" height="4" aria-hidden="true"><line x1="0" x2="12" y1="2" y2="2" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
          <span className="text-muted-foreground">Budget</span><b className="font-semibold">{shortMoney(model.budget)}</b></span>}
      </div>
      <div style={{ width: "100%", height: chartHeight(mobile) }}>
        <ResponsiveContainer>
          <ComposedChart data={model.points} margin={{ top: 12, right: mobile ? 22 : 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="purchasingCumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" ticks={mobile ? ticks.filter((_, i) => i % 2 === 0) : ticks} interval={0} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, top]} ticks={yTicks} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtHKD(v as number, true)} width={48} />
            <Tooltip content={tip} />
            <Line type="monotone" dataKey="budget" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
            {priorName && <Line type="monotone" dataKey="prior" stroke="hsl(var(--primary))" strokeOpacity={0.3} strokeWidth={2} dot={false} {...lineBuild(play, 1)} connectNulls={false} />}
            <Area type="monotone" dataKey="current" stroke="none" fill="url(#purchasingCumFill)" {...lineBuild(play, 1)} connectNulls={false} />
            <Line type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} {...lineBuild(play, 1)} connectNulls={false}>
              <LabelList dataKey="current" content={(p: any) => model.last && p.index === model.points.indexOf(model.last) && p.value != null
                ? <circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={2} /> : null} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
