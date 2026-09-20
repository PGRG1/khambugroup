import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { Agg, DailyPoint, fmtHKD, fmtPct, pctDelta } from "./utils";
import type { ForecastOverviewSummary } from "@/utils/revenueForecastOverview";

interface Props {
  cur: Agg;
  prev: Agg | null;
  sparkline90: DailyPoint[];
  forecast?: ForecastOverviewSummary;
}

function ForecastBlock({ forecast }: { forecast?: ForecastOverviewSummary }) {
  const rangeLabel =
    forecast?.comparisonFrom && forecast?.comparisonTo
      ? `${forecast.comparisonFrom.slice(8)}–${forecast.comparisonTo.slice(8)} ${new Date(
          `${forecast.comparisonTo}T00:00:00`,
        ).toLocaleDateString("en-GB", { month: "short" })}`
      : "";

  return (
    <div className="lg:px-6 lg:border-l lg:border-border/50">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Forecast</div>
        {rangeLabel && (
          <div className="text-[11px] text-muted-foreground tabular-nums">{rangeLabel}</div>
        )}
      </div>

      {!forecast || forecast.status === "unavailable" ? (
        <>
          <div className="mt-1 text-[24px] leading-none font-semibold tabular-nums text-muted-foreground">—</div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            Select a single month to see forecast
          </div>
        </>
      ) : forecast.status === "incomplete" ? (
        <>
          <div className="mt-1 text-[24px] leading-none font-semibold tabular-nums text-muted-foreground">—</div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            Forecast incomplete · {forecast.forecastedVenueDays}/{forecast.scopedVenueDays} venue-days
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-[24px] leading-none font-semibold tabular-nums text-foreground">
            HK${fmtHKD(forecast.forecastTotal ?? 0)}
          </div>
          <div className="mt-2 text-[13px] tabular-nums">
            <span
              className={
                (forecast.variance ?? 0) < 0 ? "text-destructive" : "text-primary"
              }
            >
              {(forecast.variance ?? 0) < 0 ? "−" : "+"}HK$
              {fmtHKD(Math.abs(forecast.variance ?? 0))}
              {forecast.variancePct !== null && (
                <span className="ml-1">({fmtPct(forecast.variancePct)})</span>
              )}
            </span>
            <span className="ml-1 text-muted-foreground">vs forecast</span>
          </div>
        </>
      )}
    </div>
  );
}

export function HeroBand({ cur, prev, sparkline90, forecast }: Props) {
  const avgPerDay = cur.days ? cur.revenue / cur.days : 0;
  const delta = prev && prev.days ? pctDelta(cur.revenue, prev.revenue) : null;

  const sparkData = sparkline90.map((p) => ({ v: p.revenue }));

  return (
    <div className="glass-surface rounded-xl border border-border/60 px-5 py-6 sm:py-7">
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

        {/* Middle: New Targets forecast */}
        <ForecastBlock forecast={forecast} />

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
