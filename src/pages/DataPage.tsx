import { useVenueScope } from "@/hooks/useVenueScope";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { toast } from "@/hooks/use-toast";
import { consumeSalesHandoff, decideSalesHandoff, peekSalesHandoff, subscribeSalesHandoff } from "@/utils/scannerHandoff";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useManualRevenue } from "@/hooks/useManualRevenue";
import DataUpload from "@/components/dashboard/DataUpload";
import ManualInput from "@/components/dashboard/ManualInput";
import ReceiptScanner from "@/components/dashboard/ReceiptScanner";
import DateFilter from "@/components/dashboard/DateFilter";
import { DailyRecords } from "@/components/sales/DailyRecords";
import { SalesDetailPanel } from "@/components/sales/SalesDetailPanel";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { useSalesNotes } from "@/hooks/useSalesNotes";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { isoDay } from "@/utils/salesRecordChecks";
import { mtdRange } from "@/components/revenue-overview/utils";
import { monthSoFarLabel } from "@/utils/revenueOverview";
import type { DayNote } from "@/components/dashboard/ManualInput";
import type { SalesRecord } from "@/types/sales";
import { OtherRevenuePanel } from "@/pages/revenue/OtherRevenue";
import { Upload, PenLine, ScanLine, ChevronDown, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/expenses/shared";

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
  const navigate = useNavigate();
  const { tenantId: _t, memberships } = useActiveTenant() as any;
  const tenantName = (memberships ?? []).find((m: any) => m.tenant_id === tenantId)?.tenant_name ?? "sales";
  const notes = useSalesNotes();
  const { rows: allPeriods } = useVenueServicePeriods();

  // Period (same control as the other Revenue pages). Default: this month so far.
  const [from, setFrom] = useState<Date | undefined>(() => mtdRange().from);
  const [to, setTo] = useState<Date | undefined>(() => mtdRange().to);
  const [periodName, setPeriodName] = useState(() => monthSoFarLabel());
  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);
  const handlePeriodSelect = (period: string) => {
    if (period === "MTD") { const r = mtdRange(); setFrom(r.from); setTo(r.to); setPeriodName(monthSoFarLabel()); return; }
    if (period === "All Time") { setFrom(undefined); setTo(undefined); setPeriodName("All time"); return; }
    if (period === "Custom") { setPeriodName("Selected dates"); return; }
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
    setPeriodName(period);
  };
  const today = isoDay(new Date());
  const fromIso = from ? isoDay(from) : (scopedData.map((r) => r.date).sort()[0] ?? today);
  const toIso = to ? isoDay(to) : today;
  const periodRecords = useMemo(() => scopedData.filter((r) => r.date >= fromIso && r.date <= toIso), [scopedData, fromIso, toIso]);
  const scopedPeriods = useMemo(
    () => allPeriods.filter((p: any) => vs.includesId(p.venueId ?? p.venue_id)).map((p: any) => ({ id: p.id, name: p.name })),
    [allPeriods, vs.includesId],
  );
  const periodNameOf = (id?: string | null) => (id ? allPeriods.find((p: any) => p.id === id)?.name : undefined);

  const [openRecord, setOpenRecord] = useState<SalesRecord | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<SalesRecord | null>(null);
  const [prefill, setPrefill] = useState<{ date: string; venue: string } | null>(null);
  const canFix = isAdmin && !isActionHidden("data.edit_rows");

  const saveNote = async (r: SalesRecord, note?: DayNote | null) => {
    if (!note?.body.trim()) return;
    const ok = await notes.addNoteForDay(r.date, r.venue, r.reportNumber, note.body, note.tag);
    if (!ok) toast({ title: "Sales saved, but the note didn't save", description: "Open the day and add the note again.", variant: "destructive" });
  };

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
          <DropdownMenuItem className="min-h-10" onSelect={() => { closePanels(); setPrefill(null); setShowManual(true); setView("daily"); }}>
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


  return (
    <div className="w-full mx-auto space-y-6">
      <RevenuePageTop
        title="Sales records"
        period={!isActionHidden("revenue.date_range") && (
          <DateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo}
            months={months.map((m) => m.label)} onPeriodSelect={handlePeriodSelect} includeMtd initialPeriod="MTD" labelled />
        )}
        actions={actions}
      />

      {loading ? (
        <>
          <div className="card-glass rounded-xl">
            <TableSkeleton rows={8} cols={7} />
          </div>
        </>
      ) : (
        <>
          {isAdmin && !hideUpload && showUpload && (
            <DataUpload
              history={scopedData}
              onUpload={async (records, note) => { const ok = await uploadRecords(records); if (ok && records.length === 1) await saveNote(records[0], note); }}
              onScanFile={(file) => { setShowUpload(false); setScanFile(file); setShowScanner(true); setView("daily"); }}
              onClose={() => setShowUpload(false)}
            />
          )}
          {isAdmin && !hideScanReceipt && showScanner && (
            <ReceiptScanner
              initialFile={scanFile}
              history={scopedData}
              onSave={async (record, file, note) => { const ok = await addRecord(record, file); if (ok) await saveNote(record, note); }}
              onClose={() => { setShowScanner(false); setScanFile(null); }}
            />
          )}
          {isAdmin && !hideManualEntry && showManual && (
            <ManualInput key={prefill ? `${prefill.venue}-${prefill.date}` : "blank"} initial={prefill} history={scopedData}
              onAdd={async (record, file, note) => { const ok = await addRecord(record, file); if (ok) { await saveNote(record, note); setPrefill(null); } }}
              onClose={() => { setShowManual(false); setPrefill(null); }} />
          )}

          <div ref={dailyRef} className="scroll-mt-16">
            <DailyRecords
              records={periodRecords}
              venues={vs.selectedVenues.map((v) => ({ id: v.id, name: v.name }))}
              from={fromIso} to={toIso} today={today}
              periodLabel={periodName} tenantName={tenantName}
              notesByRecord={notes.byRecord}
              servicePeriods={scopedPeriods}
              openId={openRecord?.id ?? null}
              onOpen={setOpenRecord}
              onAddDay={isAdmin && !hideManualEntry ? (date, venue) => {
                closePanels(); setPrefill({ date, venue }); setShowManual(true);
                requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
              } : undefined}
            />
          </div>
          <section ref={otherRef} className="scroll-mt-16 space-y-3" aria-labelledby="other-income">
            <h2 id="other-income" className="text-lg font-display font-semibold">Other income</h2>
            <div className="card-glass rounded-xl p-3 sm:p-4"><OtherRevenuePanel embedded /></div>
          </section>

          <SalesDetailPanel
            record={openRecord}
            onClose={() => setOpenRecord(null)}
            notes={(openRecord?.id && notes.byRecord.get(openRecord.id)) || []}
            onAddNote={(body, tag) => (openRecord?.id ? notes.addNote(openRecord.id, body, tag) : Promise.resolve(false))}
            canFix={canFix}
            onFix={() => openRecord?.id && navigate(`/sales-data/${openRecord.id}?edit=1`)}
            onViewReceipt={() => setViewingReceipt(openRecord)}
            servicePeriodName={periodNameOf(openRecord?.servicePeriodId)}
          />
          {viewingReceipt?.receiptFileUrl && (
            <AttachmentViewerDialog open onOpenChange={(o) => { if (!o) setViewingReceipt(null); }}
              fileUrl={viewingReceipt.receiptFileUrl} title={`Receipt — ${viewingReceipt.venue} ${viewingReceipt.date}`} bucket="sales-receipts" />
          )}
        </>
      )}
    </div>
  );
};

export default DataPage;
