import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { toast } from "@/hooks/use-toast";
import { consumeSalesHandoff, decideSalesHandoff, peekSalesHandoff, subscribeSalesHandoff } from "@/utils/scannerHandoff";
import { useSearchParams } from "react-router-dom";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useManualRevenue } from "@/hooks/useManualRevenue";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DataTable from "@/components/dashboard/DataTable";
import { OtherRevenuePanel } from "@/pages/revenue/OtherRevenue";
import { Upload, PenLine, ScanLine, Plus, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  KpiCard,
  KpiGrid,
  KpiSkeleton,
  TableSkeleton,
  fmtHKWhole,
  fmtInt,
} from "@/components/expenses/shared";

type ViewKey = "all" | "daily" | "other";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "daily", label: "Daily Sales" },
  { key: "other", label: "Other Revenue" },
];

const DataPage = () => {
  const { data, loading, uploadRecords, addRecord } = useSalesData();
  const { isAdmin, user, roleLoading } = useAuth();
  const { tenantId } = useActiveTenant();
  const { isPreviewActive } = usePreviewMode();
  const { isActionHidden } = usePagePermissions();
  const mr = useManualRevenue();

  const [params, setParams] = useSearchParams();
  const rawView = params.get("view") as ViewKey | null;
  const view: ViewKey = rawView && VIEWS.some((v) => v.key === rawView) ? rawView : "all";
  const setView = (v: ViewKey) => setParams(v === "all" ? {} : { view: v }, { replace: true });

  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);

  const hideUpload = isActionHidden("data.upload");
  const hideScanReceipt = isActionHidden("data.scan_receipt");
  const hideManualEntry = isActionHidden("data.manual_entry");

  // Floating-Bani sales receipt handoff: scope-checked, consumed once, never replaces an open receipt.
  const salesHandoff = useSyncExternalStore(subscribeSalesHandoff, peekSalesHandoff);
  useEffect(() => {
    if (!salesHandoff || roleLoading) return;
    const decision = decideSalesHandoff(salesHandoff, { identity: `${user?.id}:${tenantId}:${isPreviewActive}`, canScan: isAdmin && !hideScanReceipt, busy: false });
    if (decision === "skip") return;
    consumeSalesHandoff(salesHandoff.id);
    if (decision === "denied") {
      toast({ title: "No access to Scan Receipt", description: "Ask an admin for access to upload sales receipts.", variant: "destructive" });
      return;
    }
    if (showScanner) {
      toast({ title: "A receipt is already open", description: "Finish or close the current receipt, then ask Bani again." });
      return;
    }
    setShowUpload(false); setShowManual(false); setScanFile(salesHandoff.file); setShowScanner(true); setView("daily");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesHandoff, roleLoading, user?.id, tenantId, isPreviewActive, isAdmin, hideScanReceipt]);

  const kpis = useMemo(() => {
    const totalSales = data.reduce((s, r) => s + r.totalSales, 0);
    const uniqueDays = new Set(data.map((r) => r.date)).size;
    const needsReview = data.filter(
      (r) => Math.abs(r.totalSales - (r.subtotal + r.serviceCharge + r.discount)) > 0.01
    ).length;
    const otherRevenue = mr.entries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const otherDrafts = mr.entries.filter((e) => e.status === "draft").length;
    return { totalSales, uniqueDays, needsReview, otherRevenue, otherDrafts };
  }, [data, mr.entries]);

  const closePanels = () => { setShowUpload(false); setShowManual(false); setShowScanner(false); setScanFile(null); };

  const actions = isAdmin ? (
    <div className="flex flex-wrap gap-2">
      {!hideUpload && (
        <Button
          variant={showUpload ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => { const next = !showUpload; closePanels(); setShowUpload(next); }}
        >
          <Upload className="h-4 w-4" />
          <span>Upload Sales</span>
        </Button>
      )}
      {(!hideManualEntry || !hideScanReceipt) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4" />
              <span>Add Revenue</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!hideManualEntry && (
              <DropdownMenuItem
                onSelect={() => { closePanels(); setShowManual(true); setView("daily"); }}
              >
                <PenLine className="h-4 w-4 mr-2" /> Daily sales entry
              </DropdownMenuItem>
            )}
            {!hideScanReceipt && (
              <DropdownMenuItem onSelect={() => { closePanels(); setShowScanner(true); setView("daily"); }}>
                <ScanLine className="h-4 w-4 mr-2" /> Scan receipt
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => { closePanels(); setView("other"); }}>
              <Coins className="h-4 w-4 mr-2" /> Other revenue entry
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  ) : undefined;

  const showDaily = view === "all" || view === "daily";
  const showOther = view === "all" || view === "other";

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={`inline-flex h-7 shrink-0 items-center rounded-md px-3 text-[12px] font-medium transition-colors ${
                view === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {actions}
      </div>

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
              label="Total Recorded"
              value={fmtHKWhole(kpis.totalSales)}
              hint={`${fmtInt(data.length)} record${data.length === 1 ? "" : "s"}`}
              tone="info"
            />
            <KpiCard
              label="Sales Days"
              value={fmtInt(kpis.uniqueDays)}
              hint="Unique trading days recorded"
            />
            <KpiCard
              label="Needs Review"
              value={fmtInt(kpis.needsReview)}
              hint={kpis.needsReview > 0 ? "Totals do not balance" : "All balanced"}
              tone={kpis.needsReview > 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Other Revenue"
              value={fmtHKWhole(kpis.otherRevenue)}
              hint={`${fmtInt(mr.entries.length)} entr${mr.entries.length === 1 ? "y" : "ies"} · ${fmtInt(kpis.otherDrafts)} draft`}
            />
          </KpiGrid>

          {isAdmin && !hideUpload && showUpload && (
            <DataUpload
              onUpload={async (records) => { await uploadRecords(records); }}
              onScanFile={(file) => { setShowUpload(false); setScanFile(file); setShowScanner(true); setView("daily"); }}
              onClose={() => setShowUpload(false)}
            />
          )}
          {isAdmin && !hideScanReceipt && showScanner && (
            <ReceiptScanner
              initialFile={scanFile}
              onSave={async (record, file) => { await addRecord(record, file); }}
              onClose={() => { setShowScanner(false); setScanFile(null); }}
            />
          )}
          {isAdmin && !hideManualEntry && showManual && (
            <ManualInput onAdd={async (record, file) => { await addRecord(record, file); }} onClose={() => setShowManual(false)} />
          )}

          {showDaily && <DataTable data={data} />}
          {showOther && <OtherRevenuePanel embedded />}
        </>
      )}
    </div>
  );
};

export default DataPage;
