import { useMemo } from "react";
import { ForecastWithActuals } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";
import { Target, TrendingUp, TrendingDown, BarChart3, DollarSign, Users, LineChart } from "lucide-react";

interface ForecastKPICardsProps {
  data: ForecastWithActuals[];
}

const ForecastKPICards = ({ data }: ForecastKPICardsProps) => {
  const kpis = useMemo(() => {
    const withActuals = data.filter((d) => d.actualTotalSales !== null);

    const totalActualSales = withActuals.reduce((s, d) => s + (d.actualTotalSales ?? 0), 0);
    const totalActualGuests = withActuals.reduce((s, d) => s + (d.actualCustomers ?? 0), 0);
    const avgPerGuest = totalActualGuests > 0 ? Math.round(totalActualSales / totalActualGuests) : 0;

    if (withActuals.length === 0) return { hasActuals: false, totalActualSales: 0, totalActualGuests: 0, avgPerGuest: 0, overallAccuracy: 0, totalVariance: 0, avgError: 0, totalForecast: 0, totalActual: 0, count: 0 };

    const accuracies = withActuals.map((d) =>
      d.forecastedTotalSales > 0
        ? (1 - Math.abs(d.totalSalesVariance ?? 0) / d.forecastedTotalSales) * 100
        : 0
    );
    const overallAccuracy = Math.round(accuracies.reduce((s, a) => s + a, 0) / accuracies.length);
    const totalVariance = withActuals.reduce((s, d) => s + (d.totalSalesVariance ?? 0), 0);
    const avgError = Math.round(
      withActuals.reduce((s, d) => s + Math.abs(d.totalSalesVariance ?? 0), 0) / withActuals.length
    );
    const totalForecast = withActuals.reduce((s, d) => s + d.forecastedTotalSales, 0);

    return { hasActuals: true, totalActualSales, totalActualGuests, avgPerGuest, overallAccuracy, totalVariance, avgError, totalForecast, totalActual: totalActualSales, count: withActuals.length };
  }, [data]);

  // Actuals summary cards (always shown)
  const actualCards = [
    {
      label: "Total Sales",
      value: formatCurrency(kpis.totalActualSales),
      icon: DollarSign,
      color: "text-amber-600",
    },
    {
      label: "Total Guests",
      value: kpis.totalActualGuests.toLocaleString(),
      icon: Users,
      color: "text-sky-600",
    },
    {
      label: "Avg / Guest",
      value: formatCurrency(kpis.avgPerGuest),
      icon: LineChart,
      color: "text-amber-600",
    },
  ];

  if (!kpis.hasActuals) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actualCards.map((card) => (
          <div key={card.label} className="card-glass rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">No actuals data yet</p>
          </div>
        ))}
      </div>
    );
  }

  const forecastCards = [
    {
      label: "Overall Accuracy",
      value: `${kpis.overallAccuracy}%`,
      sub: `Based on ${kpis.count} days with actuals`,
      icon: Target,
      color: kpis.overallAccuracy >= 80 ? "text-emerald-600" : kpis.overallAccuracy >= 60 ? "text-amber-500" : "text-destructive",
    },
    {
      label: "Total Variance",
      value: `${kpis.totalVariance >= 0 ? "+" : ""}${formatCurrency(kpis.totalVariance)}`,
      sub: kpis.totalVariance >= 0 ? "Actuals exceeded forecast" : "Actuals below forecast",
      icon: kpis.totalVariance >= 0 ? TrendingUp : TrendingDown,
      color: kpis.totalVariance >= 0 ? "text-emerald-600" : "text-destructive",
    },
    {
      label: "Avg Forecast Error",
      value: formatCurrency(kpis.avgError),
      sub: "Average absolute deviation per day",
      icon: BarChart3,
      color: "text-primary",
    },
    {
      label: "Forecast vs Actual Total",
      value: formatCurrency(kpis.totalActual),
      sub: `Forecast: ${formatCurrency(kpis.totalForecast)}`,
      icon: BarChart3,
      color: "text-primary",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Actuals summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actualCards.map((card) => (
          <div key={card.label} className="card-glass rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className="text-2xl font-bold font-display">{card.value}</p>
          </div>
        ))}
      </div>
      {/* Forecast accuracy cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {forecastCards.map((card) => (
          <div key={card.label} className="card-glass rounded-xl p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className={`text-2xl font-bold font-display ${card.color}`}>{card.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ForecastKPICards;
