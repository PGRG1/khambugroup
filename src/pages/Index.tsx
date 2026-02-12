import { useState, useMemo } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DateFilter from "@/components/dashboard/DateFilter";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import KPICards from "@/components/dashboard/KPICards";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import DataTable from "@/components/dashboard/DataTable";

const Index = () => {
  const { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord } = useSalesData();
  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showTable, setShowTable] = useState(false);

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
    if (period === "Custom") return;
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

  const handleUpload = async (records: typeof data) => {
    await uploadRecords(records);
  };

  const handleUpdateRecord = async (index: number, record: typeof data[0]) => {
    const oldRecord = data[index];
    if (oldRecord) await updateRecord(oldRecord, record);
  };

  const handleDeleteRecord = async (index: number) => {
    const record = data[index];
    if (record) await deleteRecord(record);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading data...</p>
      </div>
    );
  }

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
            onAdd={async (record) => { await addRecord(record); }}
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
