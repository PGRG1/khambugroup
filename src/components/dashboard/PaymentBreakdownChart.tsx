import { formatCurrency } from "@/utils/salesUtils";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { monthOpacity } from "@/components/revenue-overview/chartTheme";

interface PaymentBreakdownChartProps {
  data: { name: string; value: number }[];
}

const PaymentBreakdownChart = ({ data }: PaymentBreakdownChartProps) => {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + d.value, 0);
  const maxValue = Math.max(...sorted.map((d) => d.value));

  return (
    <ChartShell title="Payment Methods" subtitle="Revenue by payment type">
      <div className="space-y-3">
        {sorted.map((item, i) => {
          const pct = total ? ((item.value / total) * 100).toFixed(1) : "0";
          const barWidth = maxValue ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">{item.name}</span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  ${formatCurrency(item.value)} · {pct}%
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: "hsl(var(--primary))",
                    opacity: monthOpacity(i),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartShell>
  );
};

export default PaymentBreakdownChart;
