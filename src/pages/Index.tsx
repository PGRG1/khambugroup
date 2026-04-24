import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import DateFilter from "@/components/dashboard/DateFilter";
import KPICards from "@/components/dashboard/KPICards";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DataTable from "@/components/dashboard/DataTable";
import ResetDataButton from "@/components/dashboard/ResetDataButton";
import VenueSeatingEditor from "@/components/dashboard/VenueSeatingEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { generateMTDReport } from "@/utils/generateReport";
import { FileDown, FileText, Upload, PenLine, ScanLine, Armchair } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import MTDTextReport from "@/components/dashboard/MTDTextReport";
import { getVenueSeats } from "@/constants/venueSeating";

const venues: VenueFilter[] = ["All Venues", "Assembly", "Caliente", "Hanabi", "Events"];

const Index = () => {
  const { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord, refetch } = useSalesData();
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [activeTab, setActiveTab] = useState("overview");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [view, setView] = useState<"daily" | "monthly">("daily");

  // Data tab state
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showMTDText, setShowMTDText] = useState(false);
  const [showSeatingEditor, setShowSeatingEditor] = useState(false);
  const [seatingKey, setSeatingKey] = useState(0);

  const hideUpload = isActionHidden("data.upload");
  const hideScanReceipt = isActionHidden("data.scan_receipt");
  const hideManualEntry = isActionHidden("data.manual_entry");
  const hideEditRows = isActionHidden("data.edit_rows");
  const hideDeleteRows = isActionHidden("data.delete_rows");
  const hideReset = isActionHidden("data.reset");

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
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
    const uniqueDays = new Set(filtered.map((r) => r.date)).size || 1;
    return {
      totalSales, totalGuests, totalOrders,
      avgPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      avgPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      totalDiscount,
      salesPerDay: Math.round(totalSales / uniqueDays),
      guestsPerDay: Math.round(totalGuests / uniqueDays),
    };
  }, [filtered]);

  const currentMonthLabel = useMemo(() => {
    if (from) {
      const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
      return getMonthLabel(key);
    }
    if (months.length > 0) return months[months.length - 1].label;
    return new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [from, months]);

  const handleGenerateReport = useCallback(() => {
    if (filtered.length === 0) {
      toast({ title: "No data to report", description: "Select a period with data first.", variant: "destructive" });
      return;
    }
    generateMTDReport({ data: filtered, venue, monthLabel: currentMonthLabel });
    toast({ title: "Report downloaded!", description: `${currentMonthLabel} MTD report saved.` });
  }, [filtered, venue, currentMonthLabel]);

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
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  const hideGenerateReport = isActionHidden("revenue.generate_report");
  const hideDateRange = isActionHidden("revenue.date_range");
  const hideVenueFilter = isActionHidden("revenue.venue_filter");
  const hideViewToggle = isActionHidden("revenue.view_toggle");
  const canEdit = isAdmin && !hideEditRows;
  const canDelete = isAdmin && !hideDeleteRows;

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base sm:text-2xl font-bold font-display tracking-tight shrink-0">
            <span className="text-gradient-gold">Revenue</span>
            <span className="text-muted-foreground ml-1 sm:ml-2 text-[10px] sm:text-base font-normal">Overview</span>
          </h1>
          {activeTab === "overview" && isAdmin && (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setShowSeatingEditor(true)}
                className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md sm:rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
              >
                <Armchair className="h-3 w-3" />
                <span className="hidden sm:inline">Seats</span>
              </button>
              {!hideGenerateReport && (
                <>
                  <button
                    onClick={() => setShowMTDText(true)}
                    className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md sm:rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="hidden sm:inline">MTD </span>Summary
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md sm:rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
                  >
                    <FileDown className="h-3 w-3" />
                    Report
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {activeTab === "overview" && !hideVenueFilter && (
          <div className="flex items-center gap-1 flex-wrap">
            {venues.map((v) => (
              <button
                key={v}
                onClick={() => setVenue(v)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-lg border transition-colors ${
                  venue === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data">Sales Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            {!hideDateRange && (
              <DateFilter
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
                months={months.map((m) => m.label)}
                onPeriodSelect={handlePeriodSelect}
              />
            )}
            {!hideViewToggle && (
              <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                  onClick={() => setView("daily")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    view === "daily"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setView("monthly")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    view === "monthly"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly
                </button>
              </div>
            )}
          </div>

          <KPICards key={seatingKey} {...kpi} venue={venue} uniqueDays={new Set(filtered.map((r) => r.date)).size || 1} />

          {filtered.length > 0 ? (
            <DashboardCharts data={filtered} view={view} venue={venue} seats={venue !== "All Venues" ? getVenueSeats(venue) : null} seatingKey={seatingKey} />
          ) : (
            <div className="card-glass rounded-xl p-12 text-center">
              <p className="text-muted-foreground">No data for the selected filters.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="data" className="space-y-4 sm:space-y-6 mt-4">
          {isAdmin && (
            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
              {!hideUpload && (
                <button
                  onClick={() => { setShowUpload(!showUpload); setShowManual(false); setShowScanner(false); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
                    showUpload ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Upload
                </button>
              )}
              {!hideScanReceipt && (
                <button
                  onClick={() => { setShowScanner(!showScanner); setShowUpload(false); setShowManual(false); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
                    showScanner ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  <ScanLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Scan
                </button>
              )}
              {!hideManualEntry && (
                <button
                  onClick={() => { setShowManual(!showManual); setShowUpload(false); setShowScanner(false); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
                    showManual ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  <PenLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Manual
                </button>
              )}
              {!hideReset && <ResetDataButton onReset={refetch} />}
              <p className="text-[10px] sm:text-xs text-muted-foreground ml-auto">{data.length} records</p>
            </div>
          )}

          {isAdmin && !hideUpload && showUpload && (
            <DataUpload onUpload={async (records) => { await uploadRecords(records); }} onClose={() => setShowUpload(false)} />
          )}
          {isAdmin && !hideScanReceipt && showScanner && (
            <ReceiptScanner onSave={async (record) => { await addRecord(record); }} onClose={() => setShowScanner(false)} />
          )}
          {isAdmin && !hideManualEntry && showManual && (
            <ManualInput onAdd={async (record) => { await addRecord(record); }} onClose={() => setShowManual(false)} />
          )}

          <DataTable data={data} onUpdate={canEdit ? handleUpdateRecord : undefined} onDelete={canDelete ? handleDeleteRecord : undefined} />
        </TabsContent>
      </Tabs>
      <MTDTextReport open={showMTDText} onOpenChange={setShowMTDText} data={filtered} from={from} to={to} />
      <VenueSeatingEditor
        open={showSeatingEditor}
        onOpenChange={setShowSeatingEditor}
        venues={venues as string[]}
        onSave={() => setSeatingKey(k => k + 1)}
      />
    </div>
  );
};

export default Index;
