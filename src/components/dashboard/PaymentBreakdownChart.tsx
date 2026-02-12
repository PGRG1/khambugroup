import { formatCurrency } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";

const COLORS = [
  "hsl(24, 80%, 50%)",
  "hsl(210, 65%, 55%)",
  "hsl(145, 45%, 42%)",
  "hsl(258, 50%, 55%)",
  "hsl(330, 60%, 50%)",
  "hsl(50, 70%, 45%)",
  "hsl(175, 55%, 42%)",
];

interface PaymentBreakdownChartProps {
  data: { name: string; value: number }[];
}

const PaymentBreakdownChart = ({ data }: PaymentBreakdownChartProps) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <ChartCard title="Payment Methods" subtitle="Revenue by payment type">
      <div className="space-y-4 py-2">
        {data.map((item, i) => {
          const pct = total ? ((item.value / total) * 100).toFixed(1) : "0";
          const barWidth = maxValue ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  ${formatCurrency(item.value)} ({pct}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
};

export default PaymentBreakdownChart;
