import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SalesRecord } from "@/types/sales";
import { fmtHKD, fmtNum, toDaily } from "./utils";
import { getMonthKey as gm } from "@/utils/salesUtils";

interface Props {
  data: SalesRecord[];
  view: "daily" | "monthly";
  targetPerDay: number | null;
}

function movingAvgArr(arr: number[], w = 7): (number | null)[] {
  return arr.map((_, i) => {
    if (i < w - 1) return null;
    let s = 0;
    for (let j = i - w + 1; j <= i; j++) s += arr[j];
    return s / w;
  });
}

export function RevenueTrend({ data, view, targetPerDay }: Props) {
  const chartData = useMemo(() => {
    if (view === "daily") {
      const daily = toDaily(data);
      const rev = daily.map((d) => d.revenue);
      const ma = movingAvgArr(rev, 7);
      return daily.map((d, i) => ({
        key: d.date,
        label: new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        revenue: d.revenue,
        guests: d.guests,
        orders: d.orders,
        ma: ma[i],
        avgPerGuest: d.guests ? d.revenue / d.guests : 0,
      }));
    }
    // monthly
    const map = new Map<string, { revenue: number; guests: number; orders: number }>();
    for (const r of data) {
      const k = gm(r.date);
      const cur = map.get(k) ?? { revenue: 0, guests: 0, orders: 0 };
      cur.revenue += r.totalSales;
      cur.guests += r.guests;
      cur.orders += r.orders;
      map.set(k, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        key: k,
        label: k,
        revenue: v.revenue,
        guests: v.guests,
        orders: v.orders,
        ma: null,
        avgPerGuest: v.guests ? v.revenue / v.guests : 0,
      }));
  }, [data, view]);

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[13px] font-medium">Revenue Trend</div>
          <div className="text-[11px] text-muted-foreground">
            {view === "daily" ? "Daily · 7-day moving average" : "Monthly totals"}
          </div>
        </div>
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtHKD(v as number, true)}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(val: any, name: string) => {
                if (name === "revenue") return [`HK$${fmtHKD(Number(val))}`, "Revenue"];
                if (name === "ma") return [`HK$${fmtHKD(Number(val))}`, "7-day avg"];
                return [val, name];
              }}
              labelFormatter={(l, payload) => {
                const p: any = payload?.[0]?.payload;
                if (!p) return l;
                return `${l} · ${fmtNum(p.guests)} covers · HK$${fmtHKD(p.avgPerGuest)}/guest`;
              }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" fillOpacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={40} />
            {view === "daily" && (
              <Line
                type="monotone"
                dataKey="ma"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}
            {targetPerDay && view === "daily" && (
              <ReferenceLine
                y={targetPerDay}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: `Target ${fmtHKD(targetPerDay, true)}/day`,
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

