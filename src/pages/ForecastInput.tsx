import { useState, useMemo, useEffect, forwardRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, MessageSquare, TrendingUp, TrendingDown, Minus, Database, ClipboardList } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { ForecastRecord } from "@/types/forecast";
import {
  loadForecasts,
  saveForecasts,
  generateId,
  getDayFromDate,
  calculateForecast,
  mergeWithActuals,
} from "@/utils/forecastUtils";
import { formatCurrency, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { supabase } from "@/lib/supabase";
import ForecastCharts from "@/components/forecast/ForecastCharts";
import ForecastKPICards from "@/components/forecast/ForecastKPICards";
import DateFilter from "@/components/dashboard/DateFilter";

const ForecastInput = () => {
  const { venue } = useParams<{ venue: string }>();
  const venueName = venue === "caliente" ? "Caliente" : "Assembly";

  const [forecasts, setForecasts] = useState<ForecastRecord[]>(loadForecasts);
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();

  const [date, setDate] = useState("");
  const [customers, setCustomers] = useState<number>(0);
  const [avgSpend, setAvgSpend] = useState<number>(0);
  const [comment, setComment] = useState("");

  // Load actuals from database
  useEffect(() => {
    supabase
      .from("sales_records")
      .select("*")
      .order("date", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setSalesData(
            data.map((r: any) => ({
              date: r.date,
              day: r.day,
              venue: r.venue,
              reportNumber: r.report_number,
              orders: Number(r.orders),
              guests: Number(r.guests),
              subtotal: Number(r.subtotal),
              serviceCharge: Number(r.service_charge),
              discount: Number(r.discount),
              totalSales: Number(r.total_sales),
              visa: Number(r.visa),
              mastercard: Number(r.mastercard),
              amex: Number(r.amex),
              unionPay: Number(r.union_pay),
              alipay: Number(r.alipay),
              wechat: Number(r.wechat),
              cash: Number(r.cash),
              cardTips: Number(r.card_tips),
            }))
          );
        }
      });
  }, []);

  useEffect(() => {
    saveForecasts(forecasts);
  }, [forecasts]);

  const venueForecasts = useMemo(
    () => forecasts.filter((f) => f.venue === venueName).sort((a, b) => b.date.localeCompare(a.date)),
    [forecasts, venueName]
  );

  const venueSalesData = useMemo(
    () => salesData.filter((s) => s.venue === venueName),
    [salesData, venueName]
  );

  const forecastsWithActuals = useMemo(
    () => mergeWithActuals(venueForecasts, venueSalesData).sort((a, b) => b.date.localeCompare(a.date)),
    [venueForecasts, venueSalesData]
  );

  // Period filter: derive available months from merged data
  const months = useMemo(() => {
    const allDates = forecastsWithActuals.map((d) => d.date);
    const keys = [...new Set(allDates.map((d) => getMonthKey(d)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [forecastsWithActuals]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") {
      setFrom(undefined);
      setTo(undefined);
      return;
    }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  const filteredData = useMemo(() => {
    return forecastsWithActuals.filter((d) => {
      const date = new Date(d.date);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }, [forecastsWithActuals, from, to]);

  const preview = useMemo(() => calculateForecast(customers, avgSpend), [customers, avgSpend]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || customers <= 0) return;

    const calc = calculateForecast(customers, avgSpend);
    const record: ForecastRecord = {
      id: generateId(),
      date,
      day: getDayFromDate(date),
      venue: venueName,
      forecastedCustomers: customers,
      forecastedAvgSpend: avgSpend,
      forecastedGrossSales: calc.grossSales,
      forecastedServiceCharge: calc.serviceCharge,
      forecastedTotalSales: calc.totalSales,
      comment,
      createdAt: new Date().toISOString(),
    };

    setForecasts((prev) => [...prev, record]);
    setDate("");
    setCustomers(0);
    setAvgSpend(0);
    setComment("");
  };

  const handleDelete = (id: string) => {
    setForecasts((prev) => prev.filter((f) => f.id !== id));
  };

  const VarianceIndicator = forwardRef<HTMLSpanElement, { value: number | null; suffix?: string }>(
    ({ value, suffix = "" }, ref) => {
      if (value === null) return <span ref={ref} className="text-muted-foreground text-xs">—</span>;
      if (value > 0)
        return (
          <span ref={ref} className="text-emerald-600 text-xs font-medium flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" />+{formatCurrency(value)}{suffix}
          </span>
        );
      if (value < 0)
        return (
          <span ref={ref} className="text-red-500 text-xs font-medium flex items-center gap-0.5">
            <TrendingDown className="h-3 w-3" />{formatCurrency(value)}{suffix}
          </span>
        );
      return (
        <span ref={ref} className="text-muted-foreground text-xs flex items-center gap-0.5">
          <Minus className="h-3 w-3" />0{suffix}
        </span>
      );
    }
  );
  VarianceIndicator.displayName = "VarianceIndicator";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">
                <span className="text-gradient-gold">{venueName}</span>
                <span className="text-muted-foreground ml-2 text-base font-normal">Forecast</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">Forecast analytics & data entry</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <Link
                to="/forecast/assembly"
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  venueName === "Assembly"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                Assembly
              </Link>
              <Link
                to="/forecast/caliente"
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  venueName === "Caliente"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                Caliente
              </Link>
            </div>
            <button
              onClick={() => { setShowEntry(!showEntry); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showEntry ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              New Entry
            </button>
            <button
              onClick={() => setShowTable(!showTable)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showTable ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <Database className="h-4 w-4" />
              View Data
            </button>
          </div>
        </header>

        {/* Period Filter */}
        <DateFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          months={months.map((m) => m.label)}
          onPeriodSelect={handlePeriodSelect}
        />

        {/* Input Form - toggled */}
        {showEntry && (
          <div className="card-glass rounded-xl p-6 animate-fade-in">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              New Forecast Entry
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Forecasted Customers</label>
                  <input
                    type="number"
                    min={0}
                    value={customers || ""}
                    onChange={(e) => setCustomers(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Forecasted Avg Spend / Customer</label>
                  <input
                    type="number"
                    min={0}
                    value={avgSpend || ""}
                    onChange={(e) => setAvgSpend(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-xs text-muted-foreground mb-1">Preview</div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Sales</span>
                      <span className="font-medium">{formatCurrency(preview.grossSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">+ SC (10%)</span>
                      <span className="font-medium">{formatCurrency(preview.serviceCharge)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-0.5">
                      <span className="text-muted-foreground font-semibold">Total Sales</span>
                      <span className="font-bold text-primary">{formatCurrency(preview.totalSales)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Comment / Notes
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Expected busy night due to live music event..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Add Forecast
              </button>
            </form>
          </div>
        )}

        {/* Data Table - toggled */}
        {showTable && (
          <div className="card-glass rounded-xl p-6 animate-fade-in">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">
              Forecast vs Actuals — {venueName} ({filteredData.length} records)
            </h3>
            {filteredData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No forecasts yet for {venueName}. Click "New Entry" to add one.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Date</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Day</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Customers</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Avg Spend</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Total Sales</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Comment</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                    <tr className="border-b border-border/50">
                      <th className="py-1 px-2" colSpan={2}></th>
                      {["Fcst", "Act", "Var", "Fcst", "Act", "Var", "Fcst", "Act", "Var"].map((h, i) => (
                        <th key={i} className="text-center py-1 px-2 text-[10px] text-muted-foreground font-medium">{h}</th>
                      ))}
                      <th className="py-1 px-2" colSpan={2}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((f) => (
                      <tr key={f.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-2 font-medium">{f.date}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.day}</td>
                        <td className="py-2.5 px-2 text-center">{f.forecastedCustomers}</td>
                        <td className="py-2.5 px-2 text-center">{f.actualCustomers ?? "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.customerVariance} /></td>
                        <td className="py-2.5 px-2 text-center">{formatCurrency(f.forecastedAvgSpend)}</td>
                        <td className="py-2.5 px-2 text-center">{f.actualAvgSpend !== null ? formatCurrency(f.actualAvgSpend) : "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.avgSpendVariance} /></td>
                        <td className="py-2.5 px-2 text-center font-semibold">{formatCurrency(f.forecastedTotalSales)}</td>
                        <td className="py-2.5 px-2 text-center font-semibold">{f.actualTotalSales !== null ? formatCurrency(f.actualTotalSales) : "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.totalSalesVariance} /></td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground max-w-[200px] truncate" title={f.comment}>{f.comment || "—"}</td>
                        <td className="py-2.5 px-2">
                          <button onClick={() => handleDelete(f.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* KPI Summary */}
        <ForecastKPICards data={filteredData} />

        {/* Charts - always visible */}
        <ForecastCharts data={filteredData} />
      </div>
    </div>
  );
};

export default ForecastInput;
