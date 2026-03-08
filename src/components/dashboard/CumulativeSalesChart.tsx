import { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthLabel, getMonthKey } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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
  const [open, setOpen] = useState(false);

  // All available months from the full dataset
  const allMonths = useMemo(() => {
    return [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
  }, [data]);

  // Default: last 6 months
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    return allMonths.slice(-6);
  });

  // Keep selection in sync if data changes and selected months no longer exist
  const validSelected = useMemo(() => {
    const set = new Set(allMonths);
    return selectedMonths.filter((m) => set.has(m));
  }, [selectedMonths, allMonths]);

  const toggleMonth = (mk: string) => {
    if (validSelected.includes(mk)) {
      setSelectedMonths(validSelected.filter((m) => m !== mk));
    } else {
      setSelectedMonths([...validSelected, mk].sort());
    }
  };

  const removeMonth = (mk: string) => {
    setSelectedMonths(validSelected.filter((m) => m !== mk));
  };

  // Group by year for the popover
  const monthsByYear = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const mk of allMonths) {
      const year = mk.split("-")[0];
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(mk);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allMonths]);

  // Compute cumulative data only for selected months
  const cumulativeData = useMemo(() => {
    const monthGroups = new Map<string, Map<number, number>>();
    data.forEach((r) => {
      const mk = getMonthKey(r.date);
      if (!validSelected.includes(mk)) return;
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
  }, [data, validSelected]);

  if (allMonths.length === 0) return null;

  const selectedSet = new Set(validSelected);

  return (
    <ChartCard
      title="Cumulative Sales"
      className="lg:col-span-2"
      headerRight={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-auto min-h-7 py-1 px-2 text-[10px] sm:text-xs flex items-center gap-1.5 max-w-[400px]">
              {validSelected.length === 0 ? (
                <span className="text-muted-foreground">Select months…</span>
              ) : (
                <div className="flex flex-wrap gap-0.5">
                  {validSelected.map((mk) => (
                    <Badge key={mk} variant="secondary" className="text-[9px] sm:text-[10px] font-medium gap-0.5 pr-0.5 py-0">
                      {getMonthLabel(mk)}
                      <X
                        className="h-2.5 w-2.5 cursor-pointer hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); removeMonth(mk); }}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 max-h-[300px] overflow-y-auto" align="end">
            <div className="space-y-2.5">
              {monthsByYear.map(([year, mks]) => (
                <div key={year}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{year}</p>
                  <div className="flex flex-wrap gap-1">
                    {mks.map((mk) => {
                      const isSelected = selectedSet.has(mk);
                      const shortLabel = getMonthLabel(mk).replace(` ${year}`, "");
                      return (
                        <button
                          key={mk}
                          onClick={() => toggleMonth(mk)}
                          className={`px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors border ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card hover:bg-secondary border-border text-foreground/70 hover:text-foreground"
                          }`}
                        >
                          {shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      }
    >
      {cumulativeData.months.length > 0 ? (
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
              formatter={(v: number, name: string) => [`$${formatCurrency(v)}`, getMonthLabel(name)]}
              labelFormatter={(l) => `Day ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v) => getMonthLabel(v)} />
            {cumulativeData.months.map((mk, i) => (
              <Line key={mk} type="monotone" dataKey={mk} stroke={MONTH_COLORS[i % MONTH_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          Select at least one month to view cumulative sales.
        </div>
      )}
    </ChartCard>
  );
}
