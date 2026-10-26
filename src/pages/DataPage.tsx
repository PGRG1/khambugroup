import { useVenueScope } from "@/hooks/useVenueScope";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPaymentTotal } from "@/utils/salesUtils";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
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
import { Upload, PenLine, ScanLine, ChevronDown, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton, fmtInt } from "@/components/expenses/shared";

type ViewKey = "daily" | "other";

const DataPage = () => {
  const { data, loading, uploadRecords, addRecord } = useSalesData();
  const { isAdmin, user, roleLoading } = useAuth();
  const { tenantId } = useActiveTenant();
  const { isPreviewActive } = usePreviewMode();
  const { isActionHidden } = usePagePermissions();
  const mr = useManualRevenue();

  const [params, setParams] = useSearchParams();
  const rawView = params.get("view") as ViewKey | null;
  // ?view= links scroll to the matching section; both sections always show.
  const dailyRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLElement>(null);
  const setView = (v: ViewKey) => {
    setParams({ view: v }, { replace: true });
    requestAnimationFrame(() => (v === "other" ? otherRef : dailyRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [onlyMismatched, setOnlyMismatched] = useState(false);

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

  const vs = useVenueScope();
  const scopedData = useMemo(() => data.filter((r) => vs.includesName(r.venue)), [data, vs.includesName]);
  const scopedOther = useMemo(() => mr.entries.filter((r) => vs.includesId(r.venue_id)), [mr.entries, vs.includesId]);
  const kpis = useMemo(() => {
    const totalSales = scopedData.reduce((s, r) => s + r.totalSales, 0);
    const uniqueDays = new Set(scopedData.map((r) => r.date)).size;
    const needsReview = scopedData.filter((r) => Math.abs(getPaymentTotal(r) - r.totalSales) > 0.01).length;
    const otherRevenue = scopedOther.reduce((s, e) => s + Number(e.amount || 0), 0);
    const otherDrafts = scopedOther.filter((e) => e.status === "draft").length;
    return { totalSales, uniqueDays, needsReview, otherRevenue, otherDrafts };
  }, [scopedData, scopedOther]);

  const closePanels = () => { setShowUpload(false); setShowManual(false); setShowScanner(false); setScanFile(null); };

  const canUpload = !hideUpload, canScan = !hideScanReceipt, canType = !hideManualEntry, canOther = true;
  const actions = isAdmin && (canUpload || canScan || canType || canOther) ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-10">
          <span>Add sales</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canUpload && (
          <DropdownMenuItem className="min-h-10" onSelect={() => { closePanels(); setShowUpload(true); setView("daily"); }}>
            <Upload className="h-4 w-4 mr-2" /> Upload a file
          </DropdownMenuItem>
        )}
        {canScan && (
          <DropdownMenuItem className="min-h-10" onSelect={() => { closePanels(); setShowScanner(true); setView("daily"); }}>
            <ScanLine className="h-4 w-4 mr-2" /> Scan a receipt
          </DropdownMenuItem>
        )}
        {canType && (
          <DropdownMenuItem className="min-h-10" onSelect={() => { closePanels(); setShowManual(true); setView("daily"); }}>
            <PenLine className="h-4 w-4 mr-2" /> Type in a day
          </DropdownMenuItem>
        )}
        {canOther && (
          <DropdownMenuItem className="min-h-10" onSelect={() => { closePanels(); setView("other"); }}>
            <Coins className="h-4 w-4 mr-2" /> Add other income
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  useEffect(() => {
    if (loading || !rawView) return;
    (rawView === "other" ? otherRef : dailyRef).current?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const tableData = useMemo(
    () => (onlyMismatched ? data.filter((r) => vs.includesName(r.venue) && Math.abs(getPaymentTotal(r) - r.totalSales) > 0.01) : data),
    [onlyMismatched, data, vs.includesName],
  );

  return (
    <div className="w-full mx-auto space-y-6">
      <RevenuePageTop title="Sales records" actions={actions} />

      {loading ? (
        <>
          <div className="card-glass rounded-xl">
            <TableSkeleton rows={8} cols={7} />
          </div>
        </>
      ) : (
        <>
          {(kpis.needsReview > 0 || onlyMismatched) && (
            <div className="card-glass rounded-xl px-4 py-3 text-sm flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
              <span className="font-medium">
                {kpis.needsReview === 1 ? "1 day doesn't add up." : `${fmtInt(kpis.needsReview)} days don't add up.`}
              </span>
              <span className="text-muted-foreground">The payment totals don't match the day's sales.</span>
              <Button size="sm" variant="outline" className="ml-auto h-9" onClick={() => setOnlyMismatched((v) => !v)}>
                {onlyMismatched ? "Show all" : "Show them"}
              </Button>
            </div>
          )}

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

          <div ref={dailyRef} className="scroll-mt-16"><DataTable data={tableData} /></div>
          <section ref={otherRef} className="scroll-mt-16 space-y-3" aria-labelledby="other-income">
            <h2 id="other-income" className="text-lg font-display font-semibold">Other income</h2>
            <OtherRevenuePanel embedded />
          </section>
        </>
      )}
    </div>
  );
};

export default DataPage;
