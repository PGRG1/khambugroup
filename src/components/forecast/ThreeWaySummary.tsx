import { useMemo } from "react";
import { Sparkles, Target as TargetIcon, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/utils/salesUtils";
import { SalesRecord } from "@/types/sales";
import { ForecastRecord } from "@/types/forecast";
import { RevenueTarget } from "@/hooks/useRevenueTargets";
import { StatisticalDailyRow } from "@/hooks/useStatisticalRevenueTargets";

interface Props {
  year: number;
  month: number;
  selectedVenues: string[];
  salesData: SalesRecord[];
  forecasts: ForecastRecord[];
  target: RevenueTarget | null;
  statisticalDaily: StatisticalDailyRow[];
}

const ThreeWaySummary = ({
  year,
  month,
  selectedVenues,
  salesData,
  forecasts,
  target,
  statisticalDaily,
}: Props) => {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;

  const managerTotal =
    target?.targetAmount != null && target.targetAmount > 0 ? target.targetAmount : null;

  const filteredStat = useMemo(
    () => statisticalDaily.filter((r) => selectedVenues.includes(r.venueName)),
    [statisticalDaily, selectedVenues],
  );
  const statisticalTotal = filteredStat.length > 0
    ? filteredStat.reduce((s, r) => s + r.amount, 0)
    : null;
  const statisticalVenues = useMemo(
    () => Array.from(new Set(filteredStat.map((r) => r.venueName))),
    [filteredStat],
  );
  const statisticalGeneratedAt = target?.statisticalGeneratedAt ?? null;
  const statisticalModel = target?.statisticalModel ?? null;

  const actual = useMemo(
    () =>
      salesData
        .filter(
          (s) => s.date.startsWith(monthStr) && selectedVenues.includes(s.venue),
        )
        .reduce((sum, s) => sum + Number(s.totalSales || 0), 0),
    [salesData, monthStr, selectedVenues],
  );


  const forecastRowsSum = useMemo(
    () =>
      forecasts
        .filter(
          (f) => f.date.startsWith(monthStr) && selectedVenues.includes(f.venue),
        )
        .reduce((sum, f) => sum + Number(f.forecastedTotalSales || 0), 0),
    [forecasts, monthStr, selectedVenues],
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - daysElapsed);

  const paceVsManager =
    managerTotal && managerTotal > 0 && daysElapsed > 0
      ? Math.round(
          (actual / (managerTotal * (daysElapsed / daysInMonth))) * 100,
        )
      : null;

  const deltaVsManager = managerTotal != null ? actual - managerTotal : null;
  const actualLabel = isCurrentMonth ? "Actual Revenue MTD" : "Actual Revenue";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Statistical */}
      <div className="card-glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Statistical Target
        </div>
        {statisticalTotal != null ? (
          <>
            <div className="text-2xl font-bold td-num text-foreground">
              {formatCurrency(statisticalTotal)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-2">
              {statisticalModel && <span>Model: {statisticalModel}</span>}
              {statisticalGeneratedAt && (
                <span>
                  Generated {new Date(statisticalGeneratedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
              {statisticalVenues.length > 0 && (
                <span>{statisticalVenues.length} venue{statisticalVenues.length === 1 ? "" : "s"}</span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold td-num text-muted-foreground">
              —
            </div>
            <span className="chip chip-neutral mt-2 inline-flex">
              <span className="dot" /> Not generated yet
            </span>
          </>
        )}

      </div>

      {/* Manager */}
      <div className="card-glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <TargetIcon className="h-3.5 w-3.5" />
          Manager Target
        </div>
        {managerTotal != null && managerTotal > 0 ? (
          <>
            <div className="text-2xl font-bold td-num text-primary">
              {formatCurrency(managerTotal)}
            </div>
            {forecastRowsSum > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">
                Distributed: {formatCurrency(forecastRowsSum)}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-2xl font-bold td-num text-muted-foreground">
              —
            </div>
            <span className="chip chip-neutral mt-2 inline-flex">
              <span className="dot" /> Not set
            </span>
          </>
        )}
      </div>

      {/* Actual */}
      <div className="card-glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          {actualLabel}
        </div>
        <div
          className="text-2xl font-bold td-num"
          style={{ color: "hsl(199 90% 55%)" }}
        >
          {formatCurrency(actual)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>
            Day {daysElapsed}/{daysInMonth}
            {isCurrentMonth ? ` · ${daysLeft} left` : ""}
          </span>
          {deltaVsManager != null && (
            <span
              className={
                deltaVsManager >= 0 ? "text-emerald-500" : "text-destructive"
              }
            >
              Δ Mgr {deltaVsManager >= 0 ? "+" : ""}
              {formatCurrency(deltaVsManager)}
            </span>
          )}
          {paceVsManager != null && (
            <span
              className={
                paceVsManager >= 100
                  ? "text-emerald-500"
                  : paceVsManager >= 80
                    ? "text-amber-500"
                    : "text-destructive"
              }
            >
              Pace {paceVsManager}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreeWaySummary;
