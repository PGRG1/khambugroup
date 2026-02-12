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
    const withForecasts = data.filter((d) => d.forecastedTotalSales > 0);

    const totalActualSales = withActuals.reduce((s, d) => s + (d.actualTotalSales ?? 0), 0);
    const totalActualGuests = withActuals.reduce((s, d) => s + (d.actualCustomers ?? 0), 0);
    const avgPerGuest = totalActualGuests > 0 ? Math.round(totalActualSales / totalActualGuests) : 0;

    const totalForecastSales = withForecasts.reduce((s, d) => s + d.forecastedTotalSales, 0);
    const totalForecastGuests = withForecasts.reduce((s, d) => s + d.forecastedCustomers, 0);
    const avgPerGuestForecast = totalForecastGuests > 0 ? Math.round(totalForecastSales / totalForecastGuests) : 0;

    if (withActuals.length === 0) return { hasActuals: false, totalActualSales: 0, totalActualGuests: 0, avgPerGuest: 0, totalForecastSales, totalForecastGuests, avgPerGuestForecast, overallAccuracy: 0, totalVariance: 0, avgError: 0, totalForecast: 0, totalActual: 0, count: 0 };

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

    return { hasActuals: true, totalActualSales, totalActualGuests, avgPerGuest, totalForecastSales, totalForecastGuests, avgPerGuestForecast, overallAccuracy, totalVariance, avgError, totalForecast, totalActual: totalActualSales, count: withActuals.length };
  }, [data]);

  const summaryCards = [
    {
      label: "Total Sales",
      actual: formatCurrency(kpis.totalActualSales),
      forecast: formatCurrency(kpis.totalForecastSales),
      icon: DollarSign,
    },
    {
      label: "Total Guests",
      actual: kpis.totalActualGuests.toLocaleString(),
      forecast: kpis.totalForecastGuests.toLocaleString(),
      icon: Users,
    },
    {
      label: "Avg / Guest",
      actual: formatCurrency(kpis.avgPerGuest),
      forecast: formatCurrency(kpis.avgPerGuestForecast),
      icon: LineChart,
    },
  ];

  if (!kpis.hasActuals) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="card-glass rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon className="h-4 w-4 text-muted-foreground" />
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
        {summaryCards.map((card) => (
          <div key={card.label} className="card-glass rounded-xl p-5 animate-fade-in">
            <div className="flex items-center gap-1.5 mb-3">
              <card.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wider mb-0.5">Actual</p>
                <p className="text-2xl font-bold font-display">{card.actual}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wider mb-0.5">Forecast</p>
                <p className="text-lg font-semibold text-muted-foreground">{card.forecast}</p>
              </div>
            </div>
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
