import { useState, useMemo, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthLabel, getMonthKey } from "@/utils/salesUtils";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import {
  chartAxis,
  chartGrid,
  chartTooltipContentStyle,
  compactHK,
  monthOpacity,
  PRIMARY,
} from "@/components/revenue-overview/chartTheme";

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface Props {
  data: SalesRecord[];
}

export default function CumulativeSalesChart({ data }: Props) {
  const allMonths = useMemo(() => [...new Set(data.map((r) => getMonthKey(r.date)))].sort(), [data]);
  const [activeMonths, setActiveMonths] = useState<string[]>([]);
  const toggleMonth = useCallback((mk: string) => {
    setActiveMonths((prev) => (prev.includes(mk) ? prev.filter((m) => m !== mk) : [...prev, mk]));
  }, []);
  const isMonthHidden = useCallback(
    (mk: string) => activeMonths.length > 0 && !activeMonths.includes(mk),
    [activeMonths]
  );

  const opacityMap = useMemo(() => {
    const map = new Map<string, number>();
    allMonths.forEach((mk, i) => map.set(mk, monthOpacity(i)));
    return map;
  }, [allMonths]);

  const dayOfWeekMedians = useMemo(() => {
    const dailyMap = new Map<string, { guests: number; sales: number }>();
    data.forEach((r) => {
      const existing = dailyMap.get(r.date);
      if (existing) {
        existing.guests += r.guests;
        existing.sales += r.totalSales;
      } else {
        dailyMap.set(r.date, { guests: r.guests, sales: r.totalSales });
      }
    });
    const byDow: Record<number, { guests: number[]; spendPerGuest: number[] }> = {};
    for (let i = 0; i < 7; i++) byDow[i] = { guests: [], spendPerGuest: [] };
    dailyMap.forEach((val, dateStr) => {
      const d = new Date(dateStr);
      const dow = d.getDay();
      byDow[dow].guests.push(val.guests);
      if (val.guests > 0) byDow[dow].spendPerGuest.push(val.sales / val.guests / 1.1);
    });
    const result: Record<number, { medianGuests: number; medianSpend: number }> = {};
    for (let i = 0; i < 7; i++) {
      result[i] = { medianGuests: median(byDow[i].guests), medianSpend: median(byDow[i].spendPerGuest) };
    }
    return result;
  }, [data]);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return allMonths.includes(mk) ? mk : null;
  }, [allMonths]);

  const cumulativeData = useMemo(() => {
    const monthGroups = new Map<string, Map<number, number>>();
    data.forEach((r) => {
      const mk = getMonthKey(r.date);
      const dayOfMonth = new Date(r.date).getDate();
      if (!monthGroups.has(mk)) monthGroups.set(mk, new Map());
      const dayMap = monthGroups.get(mk)!;
      dayMap.set(dayOfMonth, (dayMap.get(dayOfMonth) || 0) + r.totalSales);
    });
    if (monthGroups.size === 0) return { rows: [], months: [], hasProjection: false };
    const sortedMonths = [...monthGroups.keys()].sort();

    let projectionStartDay = 0;
    let projectionMonthDays = 0;
    let lastActualCum = 0;
    const hasProjection = currentMonthKey !== null && monthGroups.has(currentMonthKey);
    if (hasProjection && currentMonthKey) {
      const [y, m] = currentMonthKey.split("-").map(Number);
      projectionMonthDays = daysInMonth(y, m - 1);
      const dayMap = monthGroups.get(currentMonthKey)!;
      projectionStartDay = Math.max(...Array.from(dayMap.keys()));
      for (let i = 1; i <= projectionStartDay; i++) lastActualCum += dayMap.get(i) || 0;
    }

    let maxDay = Math.max(...Array.from(monthGroups.values()).flatMap((m) => Array.from(m.keys())));
    if (hasProjection && projectionMonthDays > maxDay) maxDay = projectionMonthDays;

    const rows: Record<string, number | string | undefined>[] = [];
    const zeroRow: Record<string, number | string | undefined> = { day: 0 };
    sortedMonths.forEach((mk) => { zeroRow[mk] = 0; });
    rows.push(zeroRow);

    for (let d = 1; d <= maxDay; d++) {
      const row: Record<string, number | string | undefined> = { day: d };
      sortedMonths.forEach((mk) => {
        const dayMap = monthGroups.get(mk)!;
        let cumSum = 0;
        for (let i = 1; i <= d; i++) cumSum += dayMap.get(i) || 0;
        if (mk === currentMonthKey && hasProjection && d > projectionStartDay) {
          // projection handles it
        } else if (cumSum > 0) {
          row[mk] = cumSum;
        }
      });
      if (hasProjection && currentMonthKey && d > projectionStartDay && d <= projectionMonthDays) {
        const [y, m] = currentMonthKey.split("-").map(Number);
        let projCum = lastActualCum;
        for (let pd = projectionStartDay + 1; pd <= d; pd++) {
          const projDate = new Date(y, m - 1, pd);
          const dow = projDate.getDay();
          const med = dayOfWeekMedians[dow];
          projCum += med.medianGuests * med.medianSpend * 1.1;
        }
        row[`${currentMonthKey}_proj`] = Math.round(projCum);
      }
      rows.push(row);
    }
    return { rows, months: sortedMonths, hasProjection };
  }, [data, currentMonthKey, dayOfWeekMedians]);

  if (allMonths.length === 0) return null;

  return (
    <ChartShell
      title="Cumulative Sales"
      subtitle="Month-to-date progression, day-of-month aligned"
      className="lg:col-span-2"
    >
      {cumulativeData.months.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumulativeData.rows}>
              <CartesianGrid {...chartGrid} />
              <XAxis
                dataKey="day"
                type="number"
                domain={[0, 31]}
                ticks={[0, 5, 10, 15, 20, 25, 30]}
                {...chartAxis}
              />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${compactHK(v as number)}`} width={48} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number, name: string) => {
                  const isProj = name.endsWith("_proj");
                  const monthKey = isProj ? name.replace("_proj", "") : name;
                  const label = getMonthLabel(monthKey);
                  return [`$${formatCurrency(v)}`, isProj ? `${label} + Proj.` : label];
                }}
                labelFormatter={(l) => `Day ${l}`}
              />
              {cumulativeData.months.map((mk) => (
                <Line
                  key={mk}
                  dataKey={mk}
                  type="monotone"
                  stroke={PRIMARY}
                  strokeOpacity={opacityMap.get(mk) ?? 1}
                  strokeWidth={2}
                  dot={false}
                  hide={isMonthHidden(mk)}
                />
              ))}
              {cumulativeData.hasProjection && currentMonthKey && (
                <Line
                  key={`${currentMonthKey}_proj`}
                  dataKey={`${currentMonthKey}_proj`}
                  type="monotone"
                  stroke={PRIMARY}
                  strokeOpacity={opacityMap.get(currentMonthKey) ?? 1}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  hide={isMonthHidden(currentMonthKey)}
                  connectNulls={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          <div className="flex items-center justify-center gap-3 flex-wrap mt-2">
            {allMonths.map((mk) => {
              const hidden = isMonthHidden(mk);
              const op = opacityMap.get(mk) ?? 1;
              const isCurrentMonth = mk === currentMonthKey && cumulativeData.hasProjection;
              return (
                <button
                  key={mk}
                  onClick={() => toggleMonth(mk)}
                  className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ opacity: hidden ? 0.35 : 1 }}
                >
                  <svg width="28" height="10" className="shrink-0">
                    {isCurrentMonth ? (
                      <>
                        <line x1="0" y1="5" x2="12" y2="5" stroke={PRIMARY} strokeOpacity={op} strokeWidth="2" />
                        <line x1="14" y1="5" x2="28" y2="5" stroke={PRIMARY} strokeOpacity={op} strokeWidth="2" strokeDasharray="3 2" />
                        <circle cx="12" cy="5" r="3" fill="hsl(var(--card))" stroke={PRIMARY} strokeOpacity={op} strokeWidth="2" />
                      </>
                    ) : (
                      <>
                        <line x1="0" y1="5" x2="28" y2="5" stroke={PRIMARY} strokeOpacity={op} strokeWidth="2" />
                        <circle cx="14" cy="5" r="3" fill="hsl(var(--card))" stroke={PRIMARY} strokeOpacity={op} strokeWidth="2" />
                      </>
                    )}
                  </svg>
                  <span
                    className={hidden ? "text-muted-foreground line-through" : "text-foreground"}
                  >
                    {getMonthLabel(mk)}
                    {isCurrentMonth && " + Proj."}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">No data available.</div>
      )}
    </ChartShell>
  );
}
