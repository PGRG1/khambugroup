import { Link } from "react-router-dom";
import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { Agg, DailyPoint, fmtHKD, fmtNum, pctDelta } from "./utils";

interface Props {
  cur: Agg;
  prev: Agg | null;
  sparkline90: DailyPoint[];
  target: number | null; // full-month manager target
  monthProrated: number | null; // prorated target through today for the month
  monthActualMTD: number | null;
  daysInMonth: number | null;
  monthLabel: string | null;
}

export function HeroBand({ cur, prev, sparkline90, target, monthProrated, monthActualMTD, daysInMonth, monthLabel }: Props) {
  const avgPerDay = cur.days ? cur.revenue / cur.days : 0;
  const delta = prev && prev.days ? pctDelta(cur.revenue, prev.revenue) : null;

  const projected =
    target && monthActualMTD !== null && daysInMonth && monthLabel
      ? (() => {
          // run-rate through today
          const day = new Date();
          const today = day.getDate();
          const runRate = monthActualMTD / Math.max(1, today);
          return runRate * daysInMonth;
        })()
      : null;

  const pacePct =
    target && monthProrated ? (monthActualMTD! / monthProrated) * 100 : null;
  const mtdVsTargetProgress =
    target && monthActualMTD !== null ? Math.min(100, (monthActualMTD / target) * 100) : null;
  const paceDelta =
    target && monthProrated !== null && monthActualMTD !== null
      ? monthActualMTD - monthProrated
      : null;

  const sparkData = sparkline90.map((p) => ({ v: p.revenue }));

  return (
    <div className="card-glass rounded-xl border border-border/60 px-5 py-6 sm:py-7">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:gap-0">
        {/* Left: Net revenue */}
        <div className="lg:pr-6">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Revenue</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-[38px] leading-none font-semibold tabular-nums text-foreground">
              HK${fmtHKD(cur.revenue)}
            </span>
            <DeltaChip value={delta} suffix="vs prior period" />
          </div>
          <div className="mt-2 text-[13px] text-muted-foreground tabular-nums">
            HK${fmtHKD(avgPerDay)} avg/day · {cur.days} trading day{cur.days === 1 ? "" : "s"}
          </div>
        </div>

        {/* Middle: Pace vs target */}
        <div className="lg:px-6 lg:border-l lg:border-border/50">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Pace vs Target {monthLabel ? `· ${monthLabel}` : ""}
          </div>
          {target ? (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[22px] font-semibold tabular-nums">
                  HK${fmtHKD(projected ?? 0, true)}
                </span>
                <span className="text-[11px] text-muted-foreground">projected</span>
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${mtdVsTargetProgress ?? 0}%` }}
                />
              </div>
              <div className="mt-2 text-[12px] tabular-nums">
                {paceDelta !== null && (
                  <span className={paceDelta >= 0 ? "text-primary" : "text-destructive"}>
                    {paceDelta >= 0 ? "Tracking +" : "–"}HK${fmtHKD(Math.abs(paceDelta), true)} {paceDelta >= 0 ? "ahead of" : "behind"} target
                  </span>
                )}
                {pacePct !== null && (
                  <span className="text-muted-foreground"> · {pacePct.toFixed(0)}% of pace</span>
                )}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[13px] text-muted-foreground">
              No target set ·{" "}
              <Link to="/forecast" className="text-primary hover:underline">
                Set target
              </Link>
            </div>
          )}
        </div>

        {/* Right: 90-day sparkline */}
        <div className="lg:pl-6 lg:border-l lg:border-border/50">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Last 90 Days</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {sparkline90.length ? `${sparkline90.length}d` : ""}
            </div>
          </div>
          <div className="mt-2 -mx-1">
            <Sparkline data={sparkData} fill height={72} dotLast />
          </div>
        </div>
      </div>
    </div>
  );
}
