import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { Agg, DailyPoint, fmtHKD, pctDelta } from "./utils";

interface Props {
  cur: Agg;
  prev: Agg | null;
  sparkline90: DailyPoint[];
}

export function HeroBand({ cur, prev, sparkline90 }: Props) {
  const avgPerDay = cur.days ? cur.revenue / cur.days : 0;
  const delta = prev && prev.days ? pctDelta(cur.revenue, prev.revenue) : null;

  const sparkData = sparkline90.map((p) => ({ v: p.revenue }));

  return (
    <div className="glass-surface rounded-xl border border-border/60 px-5 py-6 sm:py-7">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[2fr_1fr] lg:gap-0">
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
