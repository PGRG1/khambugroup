import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Num } from "@/components/home/HomeMotion";
import { useRevenueCount } from "@/components/revenue/RevenueMotion";
import { shortMoney, goalStatus, type MonthGoal } from "@/utils/revenueOverview";
import { fmtNum } from "./utils";

/** The comparison period ("Aug", "Sep 2025") and its figures. */
export interface SoFarCompare { short: string; revenue: number; guests: number; spendPerGuest: number | null; averageDay: number }

interface Props {
  label: string;
  revenue: number;
  compare: SoFarCompare | null;
  /** Shown only for a single month: the target (one flat figure) against actual and projected. */
  target: { monthName: string; goal: MonthGoal | null; canSet: boolean } | null;
  guests: number;
  spendPerGuest: number | null;
  averageDay: number;
  targetLoading?: boolean;
}

/** "+12%", "−8%" or "Same" against the comparison period, coloured by direction. */
function Change({ cur, prev, short }: { cur: number; prev: number; short: string }) {
  if (!(prev > 0)) return null;
  const pct = ((cur - prev) / prev) * 100;
  const same = Math.abs(pct) < 0.5;
  const tone = same ? { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
    : pct > 0 ? { background: "rgba(22,163,74,.12)", color: "#15803D" } : { background: "rgba(224,123,26,.15)", color: "#B45309" };
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums" style={tone}>
    {same ? `Same as ${short}` : `${pct > 0 ? "+" : "−"}${Math.round(Math.abs(pct))}% vs ${short}`}
  </span>;
}

function Stat({ label, value, prev }: { label: string; value: string; prev: string | null }) {
  return <div className="min-w-0">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-[16px] font-semibold td-num tabular-nums">{value}</p>
    {prev && <p className="truncate text-[11px] text-muted-foreground tabular-nums">{prev}</p>}
  </div>;
}

export function SoFarCard({ label, revenue, compare, target, guests, spendPerGuest, averageDay, targetLoading = false }: Props) {
  const play = useRevenueCount();
  const targetRef = useRef<HTMLDivElement>(null);
  const lastTargetH = useRef(0);
  useLayoutEffect(() => { if (!targetLoading && targetRef.current) lastTargetH.current = targetRef.current.offsetHeight; });
  const g = target?.goal;
  const showBar = !!g && g.target != null && g.target > 0;
  const actualPct = showBar ? Math.min(100, (g!.actual / g!.target!) * 100) : 0;
  const projPct = showBar ? Math.min(100, (g!.projected / g!.target!) * 100) : 0;

  return (
    <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4" aria-label={label}>
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-[36px] sm:text-[42px] leading-none font-semibold td-num tabular-nums text-foreground"><Num value={revenue} format={shortMoney} play={play} /></p>
          {compare && <Change cur={revenue} prev={compare.revenue} short={compare.short} />}
        </div>
        {compare && compare.revenue > 0 && <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">{shortMoney(compare.revenue)} in {compare.short}</p>}
      </div>

      {/* Target section: while new figures load it keeps its last height and stays empty,
          so nothing below moves; the figures then fade in. */}
      <div ref={targetRef} style={targetLoading && lastTargetH.current ? { height: lastTargetH.current } : undefined}
        className={targetLoading ? "" : "rv-appear"} aria-busy={targetLoading || undefined}>
      {targetLoading ? null : target && (
        showBar ? (
          <div className="space-y-2">
            <div className="relative h-3 rounded-full bg-muted overflow-hidden" role="img"
              aria-label={`Actual ${shortMoney(g!.actual)}, projected ${shortMoney(g!.projected)} of ${shortMoney(g!.target!)} target`}>
              <div className="rv-fill absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${projPct}%` , ["--fd" as string]: ".8s" }} />
              <div className="rv-fill absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${actualPct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground td-num">
              <span>Actual {shortMoney(g!.actual)} · Projected {shortMoney(g!.projected)}</span>
              <span>Target {shortMoney(g!.target!)}</span>
            </div>
            {(() => { const st = goalStatus(g!); return st && <div className="text-[13px] tabular-nums">
              <p className="font-medium" style={{ color: st.good ? "#15803D" : "#B45309" }}>{st.text}</p>
              {st.detail && <p className="mt-0.5 text-[12px] text-muted-foreground">{st.detail}</p>}
            </div>; })()}
          </div>
        ) : (
          // No target: the projection, and a way to set one (not for a finished month).
          g && g.ended ? null : <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {g && <span className="text-muted-foreground tabular-nums">Projected {shortMoney(g.projected)}</span>}
            {target.canSet && <Link to="/revenue/targets-new" className="font-medium text-primary hover:underline">Set a target →</Link>}
          </div>
        )
      )}
      </div>

      {/* Three figures side by side on every screen, each with the same comparison underneath. */}
      <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Stat label="Guests" value={fmtNum(guests)} prev={compare?.guests ? `was ${fmtNum(compare.guests)}` : null} />
        <Stat label="Per guest" value={spendPerGuest === null ? "—" : shortMoney(spendPerGuest)} prev={compare?.spendPerGuest ? `was ${shortMoney(compare.spendPerGuest)}` : null} />
        <Stat label="Average day" value={shortMoney(averageDay)} prev={compare?.averageDay ? `was ${shortMoney(compare.averageDay)}` : null} />
      </div>
    </section>
  );
}
