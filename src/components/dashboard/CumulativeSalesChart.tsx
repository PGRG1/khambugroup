import { useState, useMemo, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthLabel, getMonthKey } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";

const MONTH_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(199, 89%, 55%)",
  "hsl(199, 89%, 55%)",
  "hsl(258, 50%, 55%)",
  "hsl(340, 60%, 50%)",
  "hsl(200, 60%, 45%)",
  "hsl(45, 70%, 50%)",
  "hsl(120, 40%, 45%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(222, 39%, 14%)",
    border: "1px solid hsl(215, 22%, 22%)",
    borderRadius: "8px",
    color: "hsl(210, 40%, 96%)",
    fontSize: "12px",
  },
};

const axisStyle = { fontSize: 11, fill: "hsl(217, 15%, 65%)" };
const gridColor = "hsl(215, 22%, 22%)";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const allMonths = useMemo(() => {
    return [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
  }, [data]);

  const [activeMonths, setActiveMonths] = useState<string[]>([]);

  const toggleMonth = useCallback((mk: string) => {
    setActiveMonths((prev) => {
      if (prev.includes(mk)) return prev.filter((m) => m !== mk);
      return [...prev, mk];
    });
  }, []);

  const isMonthHidden = useCallback(
    (mk: string) => activeMonths.length > 0 && !activeMonths.includes(mk),
    [activeMonths]
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    allMonths.forEach((mk, i) => map.set(mk, MONTH_COLORS[i % MONTH_COLORS.length]));
    return map;
  }, [allMonths]);

  // Compute day-of-week medians for projection
  const dayOfWeekMedians = useMemo(() => {
    // Aggregate daily totals by date first, then group by day of week
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
      const dow = d.getDay(); // 0=Sun
      byDow[dow].guests.push(val.guests);
      if (val.guests > 0) {
        // Spend per guest BEFORE service charge: totalSales includes 10% SC
        // totalSales = gross + SC = gross * 1.1 => gross = totalSales / 1.1
        // spendPerGuest (gross) = gross / guests
        // But user formula: projected = medianGuests * medianSpendPerGuest * 1.1
        // So we should store spend per guest as totalSales / guests / 1.1 (the gross spend)
        // Actually simpler: store totalSales/guests as "revenue per guest" and then
        // the projection = medianGuests * medianRevenuePerGuest (already includes SC)
        // But user says formula = guests * spend_per_guest * 1.1 SC
        // So spend_per_guest = subtotal / guests (without SC)
        // We don't have subtotal directly broken out per-day aggregated... 
        // Let's use: spend_per_guest_gross = totalSales / guests / 1.1
        byDow[dow].spendPerGuest.push(val.sales / val.guests / 1.1);
      }
    });

    const result: Record<number, { medianGuests: number; medianSpend: number }> = {};
    for (let i = 0; i < 7; i++) {
      result[i] = {
        medianGuests: median(byDow[i].guests),
        medianSpend: median(byDow[i].spendPerGuest),
      };
    }
    return result;
  }, [data]);

  // Determine which month is the "current" month (matches today's calendar month and is in data)
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

    // Find the last actual day and total days for the current month
    let projectionStartDay = 0;
    let projectionMonthDays = 0;
    let lastActualCum = 0;
    const hasProjection = currentMonthKey !== null && monthGroups.has(currentMonthKey);

    if (hasProjection && currentMonthKey) {
      const [y, m] = currentMonthKey.split("-").map(Number);
      projectionMonthDays = daysInMonth(y, m - 1);
      const dayMap = monthGroups.get(currentMonthKey)!;
      projectionStartDay = Math.max(...Array.from(dayMap.keys()));
      // Compute cumulative up to last actual day
      for (let i = 1; i <= projectionStartDay; i++) lastActualCum += dayMap.get(i) || 0;
    }

    // Max day across all months — extend to include projection days
    let maxDay = Math.max(...Array.from(monthGroups.values()).flatMap((m) => Array.from(m.keys())));
    if (hasProjection && projectionMonthDays > maxDay) maxDay = projectionMonthDays;

    const rows: Record<string, number | string | undefined>[] = [];

    for (let d = 1; d <= maxDay; d++) {
      const row: Record<string, number | string | undefined> = { day: d };
      sortedMonths.forEach((mk) => {
        const dayMap = monthGroups.get(mk)!;
        let cumSum = 0;
        for (let i = 1; i <= d; i++) cumSum += dayMap.get(i) || 0;
        // For current month, stop solid line at last actual day
        if (mk === currentMonthKey && hasProjection && d > projectionStartDay) {
          // Don't add — let projection handle it
        } else if (cumSum > 0) {
          row[mk] = cumSum;
        }
      });

      // Add projection data for the current month
      if (hasProjection && currentMonthKey) {
        if (d > projectionStartDay && d <= projectionMonthDays) {
          // Build cumulative projection starting after the last actual day
          const [y, m] = currentMonthKey.split("-").map(Number);
          let projCum = lastActualCum;
          for (let pd = projectionStartDay + 1; pd <= d; pd++) {
            const projDate = new Date(y, m - 1, pd);
            const dow = projDate.getDay();
            const med = dayOfWeekMedians[dow];
            // projected daily sales = median guests × median spend per guest × 1.1 (SC)
            const dailyProj = med.medianGuests * med.medianSpend * 1.1;
            projCum += dailyProj;
          }
          row[`${currentMonthKey}_proj`] = Math.round(projCum);
        }
      }

      rows.push(row);
    }

    return { rows, months: sortedMonths, hasProjection };
  }, [data, currentMonthKey, dayOfWeekMedians]);

  if (allMonths.length === 0) return null;

  return (
    <ChartCard title="Cumulative Sales" className="lg:col-span-2">
      {cumulativeData.months.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumulativeData.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="day"
                tick={axisStyle}
                label={{ value: "Day of Month", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "hsl(217, 15%, 65%)" } }}
              />
              <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: number, name: string) => {
                  const isProj = name.endsWith("_proj");
                  const monthKey = isProj ? name.replace("_proj", "") : name;
                  const label = getMonthLabel(monthKey);
                  return [`${formatCurrency(v)}`, isProj ? `${label} + Proj.` : label];
                }}
                labelFormatter={(l) => `Day ${l}`}
              />
              {cumulativeData.months.map((mk) => (
                <Line
                  key={mk}
                  dataKey={mk}
                  type="monotone"
                  stroke={colorMap.get(mk)}
                  strokeWidth={2}
                  dot={false}
                  hide={isMonthHidden(mk)}
                />
              ))}
              {/* Projection line for current month */}
              {cumulativeData.hasProjection && currentMonthKey && (
                <Line
                  key={`${currentMonthKey}_proj`}
                  dataKey={`${currentMonthKey}_proj`}
                  type="monotone"
                  stroke={colorMap.get(currentMonthKey)}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  hide={isMonthHidden(currentMonthKey)}
                  connectNulls={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Clickable legend with dot marker */}
          <div className="flex items-center justify-center gap-3 flex-wrap mt-2">
            {allMonths.map((mk) => {
              const hidden = isMonthHidden(mk);
              const color = colorMap.get(mk)!;
              const isCurrentMonth = mk === currentMonthKey && cumulativeData.hasProjection;
              return (
                <button
                  key={mk}
                  onClick={() => toggleMonth(mk)}
                  className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ opacity: hidden ? 0.35 : 1 }}
                >
                  {/* Line-dot-line marker — dashed if current month has projection */}
                  <svg width="28" height="10" className="shrink-0">
                    {isCurrentMonth ? (
                      <>
                        {/* Solid portion */}
                        <line x1="0" y1="5" x2="12" y2="5" stroke={color} strokeWidth="2" opacity={hidden ? 0.4 : 1} />
                        {/* Dashed portion */}
                        <line x1="14" y1="5" x2="28" y2="5" stroke={color} strokeWidth="2" strokeDasharray="3 2" opacity={hidden ? 0.4 : 1} />
                        <circle cx="12" cy="5" r="3" fill="hsl(222, 39%, 14%)" stroke={color} strokeWidth="2" opacity={hidden ? 0.4 : 1} />
                      </>
                    ) : (
                      <>
                        <line x1="0" y1="5" x2="28" y2="5" stroke={color} strokeWidth="2" opacity={hidden ? 0.4 : 1} />
                        <circle cx="14" cy="5" r="3" fill="hsl(222, 39%, 14%)" stroke={color} strokeWidth="2" opacity={hidden ? 0.4 : 1} />
                      </>
                    )}
                  </svg>
                  <span
                    style={{
                      color: hidden ? "hsl(217, 15%, 65%)" : color,
                      textDecoration: hidden ? "line-through" : "none",
                    }}
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
    </ChartCard>
  );
}
