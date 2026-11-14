import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { shortMoney, paceSentence, type TargetPace } from "@/utils/revenueOverview";
import { fmtNum } from "./utils";

/** The comparison period ("Aug", "Sep 2025") and its figures. */
export interface SoFarCompare { short: string; revenue: number; guests: number; spendPerGuest: number | null; averageDay: number }

interface Props {
  label: string;
  revenue: number;
  compare: SoFarCompare | null;
  /** Shown only for a single month. A finished month without a target shows nothing. */
  target: { monthName: string; pace: TargetPace | null; hasTarget: boolean; canSet: boolean; ended: boolean } | null;
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
  const p = target?.pace;
  const showBar = target && target.hasTarget && p && p.target > 0;
  const soldPct = showBar ? Math.min(100, (p!.sold / p!.target) * 100) : 0;
  const shouldPct = showBar ? Math.min(100, (p!.shouldBy / p!.target) * 100) : 0;
  const behind = showBar && p!.sold < p!.shouldBy;

  return (
    <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4" aria-label={label}>
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-[36px] sm:text-[42px] leading-none font-semibold td-num tabular-nums text-foreground">{shortMoney(revenue)}</p>
          {compare && <Change cur={revenue} prev={compare.revenue} short={compare.short} />}
        </div>
        {compare && compare.revenue > 0 && <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">{shortMoney(compare.revenue)} in {compare.short}</p>}
      </div>

      {targetLoading ? <div className="min-h-14 space-y-2" role="status" aria-label="Loading target"><Skeleton className="h-3 w-full !animate-none"/><Skeleton className="h-4 w-2/3 !animate-none"/></div> : target && (
        showBar ? (
          <div className="space-y-2">
            <div className="relative h-3 rounded-full bg-muted" role="img"
              aria-label={`Sold ${shortMoney(p!.sold)} of ${shortMoney(p!.target)} target; should be at ${shortMoney(p!.shouldBy)} by today`}>
              <div className={`absolute inset-y-0 left-0 rounded-full ${behind ? "bg-warning" : "bg-primary"}`} style={{ width: `${soldPct}%` }} />
              {p!.remainingDays > 0 && (
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-foreground" style={{ left: `calc(${shouldPct}% - 1px)` }} title="Where you should be by today" />
              )}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground td-num">
              <span>Sold {shortMoney(p!.sold)}</span>
              <span>Target {shortMoney(p!.target)}</span>
            </div>
            <p className="text-[13px] text-foreground/85">{paceSentence(p!)}</p>
          </div>
        ) : (
          // A month that has finished without a target shows nothing here; setting one now would not help.
          target.ended ? null : <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="text-muted-foreground">No target for {target.monthName}</span>
            {target.canSet && <Link to="/revenue/targets-new" className="font-medium text-primary hover:underline">Set a target →</Link>}
          </div>
        )
      )}

      {/* Three figures side by side on every screen, each with the same comparison underneath. */}
      <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Stat label="Guests" value={fmtNum(guests)} prev={compare?.guests ? `was ${fmtNum(compare.guests)}` : null} />
        <Stat label="Per guest" value={spendPerGuest === null ? "—" : shortMoney(spendPerGuest)} prev={compare?.spendPerGuest ? `was ${shortMoney(compare.spendPerGuest)}` : null} />
        <Stat label="Average day" value={shortMoney(averageDay)} prev={compare?.averageDay ? `was ${shortMoney(compare.averageDay)}` : null} />
      </div>
    </section>
  );
}
