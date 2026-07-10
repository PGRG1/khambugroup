import { useMemo, useState } from "react";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DataTable from "@/components/dashboard/DataTable";
import { Upload, PenLine, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  KpiCard,
  KpiGrid,
  KpiSkeleton,
  TableSkeleton,
  fmtHKWhole,
  fmtInt,
} from "@/components/expenses/shared";
import { getPaymentTotal } from "@/utils/salesUtils";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DataPage = () => {
  const { data, loading, uploadRecords, addRecord } = useSalesData();
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const hideUpload = isActionHidden("data.upload");
  const hideScanReceipt = isActionHidden("data.scan_receipt");
  const hideManualEntry = isActionHidden("data.manual_entry");

  // KPI strip — current month totals (never chart, just at-a-glance numbers).
  const kpis = useMemo(() => {
    const monthKey = currentMonthKey();
    const monthRows = data.filter((r) => r.date && r.date.slice(0, 7) === monthKey);
    const totalSales = monthRows.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = monthRows.reduce((s, r) => s + r.guests, 0);
    const totalOrders = monthRows.reduce((s, r) => s + r.orders, 0);
    const uniqueDays = new Set(monthRows.map((r) => r.date)).size;
    const cashTotal = monthRows.reduce((s, r) => s + r.cash, 0);
    const paymentTotal = monthRows.reduce((s, r) => s + getPaymentTotal(r), 0);
    const mismatched = monthRows.filter((r) => Math.abs(r.totalSales - (r.subtotal + r.serviceCharge + r.discount)) > 0.01).length;
    return {
      monthKey,
      records: monthRows.length,
      totalSales,
      totalGuests,
      totalOrders,
      uniqueDays,
      cashTotal,
      paymentTotal,
      mismatched,
    };
  }, [data]);

  const monthLabel = new Date(kpis.monthKey + "-01").toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  const actions = isAdmin ? (
    <div className="flex flex-wrap gap-2">
      {!hideUpload && (
        <Button
          variant={showUpload ? "secondary" : "default"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => { setShowUpload(!showUpload); setShowManual(false); setShowScanner(false); }}
        >
          <Upload className="h-4 w-4" />
          Upload Data
        </Button>
      )}
      {!hideScanReceipt && (
        <Button
          variant={showScanner ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => { setShowScanner(!showScanner); setShowUpload(false); setShowManual(false); }}
        >
          <ScanLine className="h-4 w-4" />
          Scan Receipt
        </Button>
      )}
      {!hideManualEntry && (
        <Button
          variant={showManual ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => { setShowManual(!showManual); setShowUpload(false); setShowScanner(false); }}
        >
          <PenLine className="h-4 w-4" />
          Manual Entry
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <div className="w-full mx-auto space-y-6">
      <PageHeader
        title="Sales Data"
        description={loading ? "Loading…" : `${fmtInt(data.length)} record${data.length === 1 ? "" : "s"} across all venues`}
        actions={actions}
      />

      {loading ? (
        <>
          <KpiSkeleton count={4} />
          <div className="card-glass rounded-xl">
            <TableSkeleton rows={8} cols={7} />
          </div>
        </>
      ) : (
        <>
          <KpiGrid>
            <KpiCard
              label={`Total Sales · ${monthLabel}`}
              value={fmtHKWhole(kpis.totalSales)}
              hint={`${fmtInt(kpis.records)} record${kpis.records === 1 ? "" : "s"} · ${fmtInt(kpis.uniqueDays)} trading day${kpis.uniqueDays === 1 ? "" : "s"}`}
              tone="info"
            />
            <KpiCard
              label={`Guests · ${monthLabel}`}
              value={fmtInt(kpis.totalGuests)}
              hint={`${fmtInt(kpis.totalOrders)} order${kpis.totalOrders === 1 ? "" : "s"}`}
            />
            <KpiCard
              label={`Cash Collected · ${monthLabel}`}
              value={fmtHKWhole(kpis.cashTotal)}
              hint={kpis.totalSales > 0 ? `${((kpis.cashTotal / kpis.totalSales) * 100).toFixed(1)}% of sales` : "—"}
            />
            <KpiCard
              label="Mismatched Totals"
              value={fmtInt(kpis.mismatched)}
              hint={kpis.mismatched > 0 ? "Needs review" : "All balanced"}
              tone={kpis.mismatched > 0 ? "warning" : "success"}
            />
          </KpiGrid>

          {isAdmin && !hideUpload && showUpload && (
            <DataUpload onUpload={async (records) => { await uploadRecords(records); }} onClose={() => setShowUpload(false)} />
          )}
          {isAdmin && !hideScanReceipt && showScanner && (
            <ReceiptScanner onSave={async (record, file) => { await addRecord(record, file); }} onClose={() => setShowScanner(false)} />
          )}
          {isAdmin && !hideManualEntry && showManual && (
            <ManualInput onAdd={async (record, file) => { await addRecord(record, file); }} onClose={() => setShowManual(false)} />
          )}

          <DataTable data={data} />
        </>
      )}
    </div>
  );
};

export default DataPage;
