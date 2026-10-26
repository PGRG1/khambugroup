import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { shortMoney, paceSentence, type TargetPace } from "@/utils/revenueOverview";
import { fmtNum } from "./utils";

interface Props {
  label: string;
  revenue: number;
  comparison: string | null;
  /** Shown only for a single month. */
  target: { monthName: string; pace: TargetPace | null; hasTarget: boolean; canSet: boolean } | null;
  guests: number;
  spendPerGuest: number | null;
  prevSpendPerGuest: { value: number; name: string } | null;
  averageDay: number;
}

export function SoFarCard({ label, revenue, comparison, target, guests, spendPerGuest, prevSpendPerGuest, averageDay }: Props) {
  const p = target?.pace;
  const showBar = target && target.hasTarget && p && p.target > 0;
  const soldPct = showBar ? Math.min(100, (p!.sold / p!.target) * 100) : 0;
  const shouldPct = showBar ? Math.min(100, (p!.shouldBy / p!.target) * 100) : 0;
  const behind = showBar && p!.sold < p!.shouldBy;

  return (
    <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4" aria-label={label}>
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-[36px] sm:text-[42px] leading-none font-semibold td-num tabular-nums text-foreground">{shortMoney(revenue)}</p>
        {comparison && <p className="mt-2 text-[14px] text-foreground/80">{comparison}</p>}
      </div>

      {target && (
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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-muted-foreground">No target set for {target.monthName} yet.</p>
            {target.canSet && (
              <Button asChild size="sm" variant="outline" className="h-9"><Link to="/revenue/targets-new">Set a target</Link></Button>
            )}
          </div>
        )
      )}

      <div className="grid grid-cols-3 gap-3 border-t border-border/50 pt-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Guests</p>
          <p className="text-[16px] font-semibold td-num tabular-nums">{fmtNum(guests)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Spent per guest</p>
          <p className="text-[16px] font-semibold td-num tabular-nums">{spendPerGuest === null ? "—" : shortMoney(spendPerGuest)}</p>
          {prevSpendPerGuest && <p className="truncate text-[11px] text-muted-foreground">{shortMoney(prevSpendPerGuest.value)} {prevSpendPerGuest.name}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Average day</p>
          <p className="text-[16px] font-semibold td-num tabular-nums">{shortMoney(averageDay)}</p>
        </div>
      </div>
    </section>
  );
}
