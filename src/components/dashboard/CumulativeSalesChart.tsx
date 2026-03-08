import { useState, useMemo, useCallback } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthLabel, getMonthKey } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";

const MONTH_COLORS = [
  "hsl(24, 80%, 50%)",
  "hsl(14, 70%, 52%)",
  "hsl(175, 55%, 42%)",
  "hsl(258, 50%, 55%)",
  "hsl(340, 60%, 50%)",
  "hsl(200, 60%, 45%)",
  "hsl(45, 70%, 50%)",
  "hsl(120, 40%, 45%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(35, 25%, 95%)",
    border: "1px solid hsl(30, 15%, 85%)",
    borderRadius: "8px",
    color: "hsl(25, 20%, 15%)",
    fontSize: "12px",
  },
};

const axisStyle = { fontSize: 11, fill: "hsl(25, 10%, 50%)" };
const gridColor = "hsl(30, 15%, 85%)";

interface Props {
  data: SalesRecord[];
}

export default function CumulativeSalesChart({ data }: Props) {
  const allMonths = useMemo(() => {
    return [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
  }, [data]);

  // Track which months are actively selected (visible). Start with all selected.
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set(allMonths));

  // Sync if allMonths changes
  const validSelected = useMemo(() => {
    const allSet = new Set(allMonths);
    return new Set([...selectedMonths].filter((m) => allSet.has(m)));
  }, [selectedMonths, allMonths]);

  const toggleMonth = useCallback((mk: string) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(mk)) {
        next.delete(mk);
      } else {
        next.add(mk);
      }
      return next;
    });
  }, []);

  // Stable color map
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    allMonths.forEach((mk, i) => map.set(mk, MONTH_COLORS[i % MONTH_COLORS.length]));
    return map;
  }, [allMonths]);

  // Compute cumulative data for ALL months
  const cumulativeData = useMemo(() => {
    const monthGroups = new Map<string, Map<number, number>>();
    data.forEach((r) => {
      const mk = getMonthKey(r.date);
      const dayOfMonth = new Date(r.date).getDate();
      if (!monthGroups.has(mk)) monthGroups.set(mk, new Map());
      const dayMap = monthGroups.get(mk)!;
      dayMap.set(dayOfMonth, (dayMap.get(dayOfMonth) || 0) + r.totalSales);
    });

    if (monthGroups.size === 0) return { rows: [], months: [] };

    const maxDay = Math.max(...Array.from(monthGroups.values()).flatMap((m) => Array.from(m.keys())));
    const sortedMonths = [...monthGroups.keys()].sort();
    const rows: Record<string, number | string>[] = [];
    for (let d = 1; d <= maxDay; d++) {
      const row: Record<string, number | string> = { day: d };
      sortedMonths.forEach((mk) => {
        const dayMap = monthGroups.get(mk)!;
        let cumSum = 0;
        for (let i = 1; i <= d; i++) cumSum += dayMap.get(i) || 0;
        if (cumSum > 0) row[mk] = cumSum;
      });
      rows.push(row);
    }
    return { rows, months: sortedMonths };
  }, [data]);

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
                label={{ value: "Day of Month", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "hsl(25, 10%, 50%)" } }}
              />
              <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: number, name: string) => {
                  if (!validSelected.has(name)) return [null, null];
                  return [`$${formatCurrency(v)}`, getMonthLabel(name)];
                }}
                labelFormatter={(l) => `Day ${l}`}
                itemSorter={() => 0}
              />
              {cumulativeData.months.map((mk) => (
                <Line
                  key={mk}
                  type="monotone"
                  dataKey={mk}
                  stroke={colorMap.get(mk)}
                  strokeWidth={2}
                  dot={false}
                  hide={!validSelected.has(mk)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* Clickable legend — click to show/select */}
          <div className="flex items-center justify-center gap-3 flex-wrap mt-2">
            {allMonths.map((mk) => {
              const isActive = validSelected.has(mk);
              const color = colorMap.get(mk)!;
              return (
                <button
                  key={mk}
                  onClick={() => toggleMonth(mk)}
                  className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity cursor-pointer hover:opacity-80"
                  style={{ opacity: isActive ? 1 : 0.35 }}
                >
                  <span
                    className="inline-block w-3 h-[3px] rounded-full"
                    style={{ backgroundColor: color, opacity: isActive ? 1 : 0.4 }}
                  />
                  <span
                    style={{
                      color: isActive ? color : "hsl(25, 10%, 50%)",
                      textDecoration: isActive ? "none" : "line-through",
                    }}
                  >
                    {getMonthLabel(mk)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          No data available.
        </div>
      )}
    </ChartCard>
  );
}
