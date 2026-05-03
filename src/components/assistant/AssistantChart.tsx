import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

export type ChartSpec = {
  type: "line" | "bar" | "pie";
  title: string;
  x_key?: string;
  series: string[];
  data: Record<string, any>[];
};

// Warm terracotta + gold palette to match the dashboard
const PALETTE = [
  "hsl(199, 89%, 55%)",   // terracotta
  "hsl(38, 80%, 55%)",   // gold
  "hsl(160, 40%, 45%)",  // sage
  "hsl(220, 50%, 55%)",  // dusty blue
  "hsl(340, 55%, 60%)",  // rose
  "hsl(280, 35%, 55%)",  // muted purple
];

const fmt = (v: any) => {
  if (typeof v !== "number") return v;
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export function AssistantChart({ spec }: { spec: ChartSpec }) {
  const xKey = spec.x_key || "name";
  const data = Array.isArray(spec.data) ? spec.data : [];
  const series = Array.isArray(spec.series) && spec.series.length ? spec.series : ["value"];

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
        No data to chart.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 my-2">
      <div className="text-xs font-display font-semibold text-foreground mb-2">{spec.title}</div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "line" ? (
            <LineChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={xKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmt} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => fmt(v)}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          ) : spec.type === "bar" ? (
            <BarChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={xKey} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmt} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => fmt(v)}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((k, i) => (
                <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : (
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: any) => fmt(v)}
              />
              <Pie
                data={data}
                dataKey={series[0]}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={{ fontSize: 10 }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
