import { useState, useMemo, useEffect } from "react";
import { SalesRecord, VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DateFilter from "@/components/dashboard/DateFilter";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import KPICards from "@/components/dashboard/KPICards";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import DataTable from "@/components/dashboard/DataTable";

const STORAGE_KEY = "khambu_sales_data";

function loadData(): SalesRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveData(data: SalesRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const Index = () => {
  const [data, setData] = useState<SalesRecord[]>(loadData);
  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") {
      setFrom(undefined);
      setTo(undefined);
      return;
    }
    if (period === "Custom") return; // handled by calendar pickers
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  const filtered = useMemo(() => filterData(data, venue, from, to), [data, venue, from, to]);

  const kpi = useMemo(() => {
    const totalSales = filtered.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = filtered.reduce((s, r) => s + r.guests, 0);
    const totalOrders = filtered.reduce((s, r) => s + r.orders, 0);
    const totalDiscount = filtered.reduce((s, r) => s + r.discount, 0);
    return {
      totalSales,
      totalGuests,
      totalOrders,
      avgPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      avgPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      totalDiscount,
    };
  }, [filtered]);

  const handleUpload = (records: SalesRecord[]) => {
    setData((prev) => {
      const existing = new Set(prev.map((r) => `${r.date}-${r.venue}-${r.reportNumber}`));
      const newRecords = records.filter((r) => !existing.has(`${r.date}-${r.venue}-${r.reportNumber}`));
      return [...prev, ...newRecords];
    });
  };

  const handleUpdateRecord = (index: number, record: SalesRecord) => {
    setData((prev) => prev.map((r, i) => (i === index ? record : r)));
  };

  const handleDeleteRecord = (index: number) => {
    setData((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <DashboardHeader
          venue={venue}
          onVenueChange={setVenue}
          onToggleUpload={() => { setShowUpload(!showUpload); setShowManual(false); }}
          onToggleManual={() => { setShowManual(!showManual); setShowUpload(false); }}
          onToggleTable={() => setShowTable(!showTable)}
        />

        <DateFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          months={months.map((m) => m.label)}
          onPeriodSelect={handlePeriodSelect}
        />

        {showUpload && <DataUpload onUpload={handleUpload} onClose={() => setShowUpload(false)} />}
        {showManual && (
          <ManualInput
            onAdd={(record) => setData((prev) => [...prev, record])}
            onClose={() => setShowManual(false)}
          />
        )}

        <KPICards {...kpi} />

        {showTable && (
          <DataTable data={data} onUpdate={handleUpdateRecord} onDelete={handleDeleteRecord} />
        )}

        {filtered.length > 0 ? (
          <DashboardCharts data={filtered} />
        ) : (
          <div className="card-glass rounded-xl p-12 text-center">
            <p className="text-muted-foreground">No data for the selected filters. Adjust your date range or venue selection.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
