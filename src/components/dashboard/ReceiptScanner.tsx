import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, X, ScanLine, Loader2, Check, Camera, AlertTriangle } from "lucide-react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { useFloatingBaniSales, useFloatingBaniSay } from "@/components/assistant/FloatingBaniContext";
import { salesOutcomeMessage, type SalesSaveResult } from "@/utils/salesSaveResult";

import { SalesRecord, type SalesLine } from "@/types/sales";
import { basicsFromLines, setupProblems, type SetupKind } from "../../../supabase/functions/_shared/setupReceipt";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/format";
import InvoiceCamera from "@/components/invoices/InvoiceCamera";
import { getPaymentTotal } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { emptySalesRecord, fileToBase64, guessMimeType, salesRecordFromScan } from "@/utils/salesReceiptRead";
import { classifySalesFile } from "@/utils/salesFileIntake";
import { matchVenueName, shouldAutoProcessInitialFile } from "@/utils/venueMatch";
import { diagnoseSalesScan, hkd } from "@/utils/salesScanLearning";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { associateSalesScan } from "@/utils/salesScanEvidence";
import { DeferredSalesFields } from '@/components/sales/DeferredSalesFields';
import { deferredSalesAmounts } from '@/utils/deferredSales';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ReceiptScannerProps {
  onSave: (record: SalesRecord, file: File | null, note: DayNote | null, scanId: string | null) => Promise<SalesSaveResult>;
  /** Earlier records, used to spot unusual days. */
  history?: SalesRecord[];
  onClose: () => void;
  /** When supplied (e.g. a PDF/photo dropped on Upload Sales) extraction starts immediately. */
  initialFile?: File | null;
}

const numberFields = [
  "orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales",
  "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "deliveroo", "foodpanda", "keeta", "cardTips",
] as const;

const fieldLabels: Record<string, string> = {
  date: "Date",
  day: "Day",
  venue: "Venue",
  reportNumber: "Report #",
  orders: "Orders",
  guests: "Guests",
  subtotal: "Subtotal",
  serviceCharge: "Service Charge",
  discount: "Discount",
  totalSales: "Total Sales",
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  unionPay: "Union Pay",
  jcb: "JCB",
  alipay: "Alipay",
  wechat: "WeChat",
  payme: "PayMe",
  cash: "Cash",
  deliveroo: "Deliveroo",
  foodpanda: "Foodpanda",
  keeta: "Keeta",
  cardTips: "Card Tips",
};

import { DayNoteField } from "@/components/sales/NoteComposer";
import { notePrompt } from "@/utils/salesRecordChecks";
import type { DayNote } from "@/components/dashboard/ManualInput";

const emptyRecord: SalesRecord = emptySalesRecord;

const ReceiptScanner = ({ onSave, onClose, initialFile, history = [] }: ReceiptScannerProps) => {
  const [noteBody, setNoteBody] = useState("");
  const [noteTag, setNoteTag] = useState<string | null>(null);
  const { venues, loading: venuesLoading } = useVenues();
  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const activeVenueNames = useMemo(() => activeVenues.map((v) => v.name), [activeVenues]);

  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(!!initialFile);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<SalesRecord | null>(null);
  // Fixes happen in the floating Bani sphere: share the live unsaved draft with it.
  const setBaniSales = useFloatingBaniSales();
  const baniSay = useFloatingBaniSay();
  useEffect(() => {
    setBaniSales(extractedData ? { record: extractedData, venues: activeVenueNames, apply: setExtractedData, note: noteBody, applyNote: setNoteBody } : null);
  }, [extractedData, activeVenueNames, setBaniSales, noteBody]);
  useEffect(() => () => setBaniSales(null), [setBaniSales]);
  const [scannedVenueRaw, setScannedVenueRaw] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const { tenantId } = useActiveTenant();
  /** The reader's untouched output, compared on save so corrections are learned silently. */
  const scannedRef = useRef<SalesRecord | null>(null);
  const evidenceScanRef = useRef<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [answerField, setAnswerField] = useState("date");
  const [answerText, setAnswerText] = useState("");
  const [outcome, setOutcome] = useState<SalesSaveResult | null>(null);
  const [stage, setStage] = useState("Reading receipt…");
  const [savedRecord, setSavedRecord] = useState<SalesRecord | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!savedRecord) return;
    const t = window.setTimeout(() => onCloseRef.current?.(), 1800);
    return () => window.clearTimeout(t);
  }, [savedRecord]);

  const processFile = useCallback(async (file: File) => {
    setScanning(true);
    setStage("Reading receipt…");
    setSavedRecord(null);
    if (venuesLoading) {
      setPendingFile(file);
      return;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum 10MB allowed.", variant: "destructive" });
      setScanning(false);
      return;
    }

    if (classifySalesFile(file) !== "scan") {
      toast({ title: "Unsupported format", description: "Please upload an image (JPG, PNG, WEBP, HEIC) or PDF.", variant: "destructive" });
      setScanning(false);
      return;
    }

    // Show preview for images
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    setExtractedData(null);
    setOutcome(null);
    evidenceScanRef.current = null;
    scannedRef.current = null;
    setOriginalFile(file);

    try {
      const base64 = await fileToBase64(file);
      if (!base64) {
        toast({ title: "Could not read file", description: "The file appears to be empty. Please try again.", variant: "destructive" });
        setScanning(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("parse-receipt", {
        body: { imageBase64: base64, mimeType: guessMimeType(file), fileName: file.name, venues: activeVenueNames, tenantId },
      });

      if (error) {
        toast({ title: "Scan failed", description: error.message, variant: "destructive" });
        const result = await onSave({ ...emptyRecord }, file, null, null);
        setOutcome(result); setExtractedData({ ...emptyRecord });
        baniSay(salesOutcomeMessage(result));
        setScanning(false);
        return;
      }

      if (!data?.success) {
        toast({ title: "Scan failed", description: data?.error || "Could not extract data.", variant: "destructive" });
        const result = await onSave({ ...emptyRecord }, file, null, null);
        setOutcome(result); setExtractedData({ ...emptyRecord });
        baniSay(salesOutcomeMessage(result));
        setScanning(false);
        return;
      }

      const raw = data.data;
      evidenceScanRef.current = typeof data.scanEvidenceId === "string" ? data.scanEvidenceId : null;
      setScannedVenueRaw(String(raw.venue ?? "").trim());
      const record = salesRecordFromScan(raw, activeVenueNames);

      scannedRef.current = record;
      setShowDetails(false);
      const deferred = deferredSalesAmounts(record);
      if (deferred.sold || deferred.used) { setExtractedData(record); setShowDetails(true); return; }
      setSaving(true);
      setStage("Cross-verifying figures…");
      const stageTimer = window.setTimeout(() => setStage(`Checking ${record.venue || "venue"} ${record.date || ""} records…`.replace("  ", " ")), 3500);
      const result = await onSave(record, file, null, evidenceScanRef.current).finally(() => window.clearTimeout(stageTimer));
      setOutcome(result);
      if (result.status === "saved") { setBaniSales(null); setSavedRecord(record); }
      else { setExtractedData(record); setShowDetails(false); }
      baniSay(salesOutcomeMessage(result));
      toast({ title: result.status === "failed" ? "Receipt not saved" : result.status === "saved" ? "Sales recorded" : "Receipt needs your review", description: salesOutcomeMessage(result), ...(result.status === "failed" ? { variant: "destructive" as const } : {}) });
    } catch (err) {
      console.error("Receipt scan error:", err);
      toast({ title: "Scan failed", description: "An unexpected error occurred.", variant: "destructive" });
      const pending = scannedRef.current;
      if (pending && (deferredSalesAmounts(pending).sold || deferredSalesAmounts(pending).used)) {
        setExtractedData(pending); setShowDetails(true);
        baniSay('Deferred revenue needs your confirmation; nothing saved.');
        return;
      }
      const result = await onSave(scannedRef.current ?? { ...emptyRecord }, file, null, evidenceScanRef.current).catch(() => ({ status: "failed" as const, error: "Receipt was not saved" }));
      setOutcome(result); setExtractedData(scannedRef.current ?? { ...emptyRecord });
      baniSay(salesOutcomeMessage(result));
    } finally {
      setScanning(false);
      setSaving(false);
    }
  }, [activeVenueNames, venuesLoading, baniSay, tenantId, onSave, setBaniSales]);

  const autoStarted = useRef<File | null>(null);
  useEffect(() => {
    const file = pendingFile ?? initialFile;
    if (file && shouldAutoProcessInitialFile({ initialFile: file, venuesLoading, alreadyStarted: autoStarted.current })) {
      autoStarted.current = file;
      setPendingFile(null);
      processFile(file);
    }
  }, [initialFile, pendingFile, venuesLoading, processFile]);

  // Safety net: if the venue master resolves after extraction, map the scanned
  // value to its canonical master name. Never overwrite an existing selection.
  useEffect(() => {
    if (!scannedVenueRaw || !activeVenueNames.length) return;
    setExtractedData((prev) => {
      if (!prev || prev.venue) return prev;
      const matched = matchVenueName(scannedVenueRaw, activeVenueNames);
      return matched ? { ...prev, venue: matched } : prev;
    });
  }, [activeVenueNames, scannedVenueRaw]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFieldChange = (field: string, value: string) => {
    if (!extractedData) return;
    setExtractedData((prev) => {
      if (!prev) return prev;
      if (numberFields.includes(field as any)) {
        let parsed = Number(value) || 0;
        // Discount and card tips are always stored as negative (deductions)
        if (field === "discount" || field === "cardTips") {
          parsed = -Math.abs(parsed);
        }
        let next = { ...prev, [field]: parsed };
        // Auto-recompute totalSales when any of its inputs change
        if (["subtotal", "serviceCharge", "discount"].includes(field)) {
          const discountAbs = Math.abs(next.discount || 0);
          next = { ...next, totalSales: next.subtotal + next.serviceCharge - discountAbs };
        }
        return next;
      }
      if (field === "venue") {
        return { ...prev, venue: value };
      }
      if (field === "date") {
        let day = "";
        if (value) {
          try { day = format(parseISO(value), "EEE"); } catch { day = ""; }
        }
        return { ...prev, date: value, day };
      }
      return { ...prev, [field]: value };
    });
  };

  // Auto-calculated validation: Total Sales = Subtotal + Service Charge − |Discount|
  const calcTotalSales = extractedData
    ? extractedData.subtotal + extractedData.serviceCharge - Math.abs(extractedData.discount)
    : 0;
  const calcPaymentTotal = extractedData
    ? getPaymentTotal(extractedData)
    : 0;

  const totalSalesMismatch = extractedData
    ? Math.abs(extractedData.totalSales - calcTotalSales) > 0.01
    : false;
  const paymentMismatch = extractedData
    ? Math.abs(calcPaymentTotal - extractedData.totalSales) > 0.01
    : false;

  const venueUnmatched = !!extractedData && !activeVenueNames.includes(extractedData.venue);
  // Clients read line by line are checked on their own lines (KHAMBU's fixed boxes are empty for them).
  const lineProblems = extractedData?.lines
    ? setupProblems(extractedData.lines.map((l) => ({ printed: l.printed, amount: l.amount, kind: (l.kind ?? null) as SetupKind | null, known: !!l.known })))
    : [];
  const diagnosis = extractedData
    ? (extractedData.lines ? { balanced: !lineProblems.length, message: lineProblems[0] ?? "", fields: [] as string[] } : diagnoseSalesScan(extractedData))
    : null;
  const flagged = new Set<string>(diagnosis?.fields ?? []);
  const ready = !!extractedData && !!diagnosis?.balanced && !venueUnmatched && !!extractedData.date;
  const compact = !showDetails && !extractedData?.lines;
  const flagCls = (f: string) => (flagged.has(f) ? " ring-2 ring-warning/60 border-warning/60" : "");

  const handleSave = async () => {
    if (!extractedData) return;
    setSaving(true);
    try {
      associateSalesScan(extractedData, evidenceScanRef.current);
      const result = await onSave(extractedData, originalFile, noteBody.trim() ? { body: noteBody, tag: noteTag } : null, evidenceScanRef.current);
      setOutcome(result);
      if (result.status === "saved") { setBaniSales(null); setSavedRecord(extractedData); setExtractedData(null); }
      baniSay(salesOutcomeMessage(result));
      toast({ title: result.status === "failed" ? "Receipt not saved" : result.status === "saved" ? "Sales recorded" : "Receipt needs your review", description: salesOutcomeMessage(result), ...(result.status === "failed" ? { variant: "destructive" as const } : {}) });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Scan Receipt
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Camera mode */}
      {showCamera && !extractedData && !scanning && (
        <InvoiceCamera
          onCapture={(file) => {
            setShowCamera(false);
            processFile(file);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Drop zone */}
      {!extractedData && !savedRecord && !scanning && !showCamera && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
            }`}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*,application/pdf";
              input.onchange = (e: any) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              };
              input.click();
            }}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop your receipt here or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, PDF (max 10MB)</p>
          </div>

          <div className="text-center">
            <span className="text-xs text-muted-foreground">or</span>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowCamera(true)}
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo with Camera
          </Button>
        </div>
      )}

      {/* Scanning state */}
      {scanning && (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2">
          <BaniProcessingMark size={32} />
          <p className="text-xs text-muted-foreground" aria-live="polite">{stage}</p>
        </div>
      )}

      {savedRecord && !scanning && (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center" role="status">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-foreground">Recorded · {savedRecord.venue} {savedRecord.date}</p>
          <p className="td-num text-sm text-muted-foreground">{formatCurrency(savedRecord.totalSales)}</p>
          <p className="text-xs text-muted-foreground">Verified twice and added to your sales. Nothing needed from you.</p>
          <Button size="sm" variant="outline" onClick={() => onClose?.()}>Done</Button>
        </div>
      )}


      {/* Extracted data review */}
      {extractedData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            {previewUrl && (
              <img src={previewUrl} alt="Receipt" className="h-20 w-auto rounded-lg border border-border object-cover" />
            )}
            <p className="text-sm text-muted-foreground">
              {outcome ? salesOutcomeMessage(outcome) : "Source verification is incomplete. These figures are tentative, not recorded sales."}
            </p>
          </div>

          {compact && extractedData && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-3">
              <p className="text-sm" dir="auto">{outcome?.status === "flagged" ? outcome.reasons?.[0] : "Which printed field needs correcting?"}</p>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Printed field to clarify" value={answerField} onChange={e => setAnswerField(e.target.value)} className="rounded-md border border-border bg-background p-2 text-sm">
                  {Object.entries(fieldLabels).filter(([key]) => key !== "day").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <input aria-label="Printed answer" dir="auto" className="min-w-0 flex-1 rounded-md border border-border bg-background p-2 text-sm" value={answerText} onChange={e => setAnswerText(e.target.value)} />
                <Button variant="outline" disabled={!answerText.trim() || saving} onClick={() => { handleFieldChange(answerField, answerText); setOutcome(null); setAnswerText(""); }}>Apply answer</Button>
              </div>
              <Button variant="outline" onClick={() => setShowDetails(true)}>⋯ Check every field</Button>
            </div>
          )}
          {false && compact && extractedData && (
            <div className="rounded-xl border border-success/40 bg-success/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="h-4 w-4" /> All payments balance with Total Sales
              </div>
              <div className="text-sm text-foreground">
                <span className="font-semibold">{extractedData.venue}</span>
                <span className="text-muted-foreground"> · {extractedData.date ? format(parseISO(extractedData.date), "EEE dd MMM yyyy") : ""}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><div className="text-xs text-muted-foreground">Total Sales</div><div className="td-num text-base font-semibold">{hkd(extractedData.totalSales)}</div></div>
                <div><div className="text-xs text-muted-foreground">Guests</div><div className="td-num text-base font-semibold">{extractedData.guests.toLocaleString("en-US")}</div></div>
                <div><div className="text-xs text-muted-foreground">Avg spend</div><div className="td-num text-base font-semibold">{extractedData.guests ? hkd(extractedData.totalSales / extractedData.guests) : "—"}</div></div>
              </div>
              <button type="button" onClick={() => setShowDetails(true)} className="text-xs text-primary hover:underline">
                ⋯ Check every field
              </button>
            </div>
          )}

          {!compact && !extractedData.lines && diagnosis && !diagnosis.balanced && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <span className="text-foreground">{diagnosis.message}</span>
            </div>
          )}

          {!compact && (<>
          {venueUnmatched && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-warning">Venue could not be matched</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {scannedVenueRaw
                    ? <>Scanned value <strong className="text-foreground">"{scannedVenueRaw}"</strong> is not in the venues master. Pick the correct venue below, or add it in Settings first.</>
                    : <>No venue was detected on the receipt. Pick the correct venue below.</>}
                </div>
              </div>
            </div>
          )}


          {/* Header fields */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input
                type="date"
                value={extractedData.date}
                onChange={(e) => handleFieldChange("date", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("date")}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Day</label>
              <input
                type="text"
                value={extractedData.day}
                onChange={(e) => handleFieldChange("day", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("day")}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Venue</label>
              <select
                value={extractedData.venue}
                onChange={(e) => handleFieldChange("venue", e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-lg border bg-secondary text-foreground focus:outline-none focus:ring-2 ${
                  venueUnmatched ? "border-warning/60 focus:ring-warning/30" : "border-border focus:ring-primary/30"
                }`}
              >
                <option value="">Select a venue…</option>
                {activeVenues.map((v) => (
                  <option key={v.id} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Report #</label>
              <input
                type="text"
                value={extractedData.reportNumber}
                onChange={(e) => handleFieldChange("reportNumber", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("reportNumber")}
              />
            </div>
            {!extractedData.lines && <div>
              <label className="text-xs text-muted-foreground block mb-1">Orders</label>
              <input
                type="number"
                value={extractedData.orders || ""}
                onChange={(e) => handleFieldChange("orders", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("orders")}
              />
            </div>}
            {!extractedData.lines && <div>
              <label className="text-xs text-muted-foreground block mb-1">Guests</label>
              <input
                type="number"
                value={extractedData.guests || ""}
                onChange={(e) => handleFieldChange("guests", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("guests")}
              />
            </div>}
          </div>

          {extractedData.lines ? (() => {
            const lines = extractedData.lines;
            const problems = setupProblems(lines.map((l) => ({ printed: l.printed, amount: l.amount, kind: (l.kind ?? null) as SetupKind | null, known: !!l.known })));
            const setLine = (i: number, v: string) => setExtractedData((prev) => {
              if (!prev?.lines) return prev;
              const next = prev.lines.map((l, j) => (j === i ? { ...l, amount: v === "" ? null : Number(v) } : l));
              const b = basicsFromLines(next.map((l) => ({ printed: l.printed, amount: l.amount, kind: (l.kind ?? null) as SetupKind | null, known: !!l.known })));
              return { ...prev, lines: next, totalSales: b.totalSales ?? 0, subtotal: b.subtotal ?? 0, serviceCharge: b.serviceCharge, discount: b.discount,
                guests: b.guests, orders: b.orders, cardTips: b.cardTips };
            });
            return (
              <div className="rounded-lg border border-border bg-background/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Lines on this report</h4>
                  <span className="text-xs text-muted-foreground">Total sales <strong className="text-foreground tabular-nums">{extractedData.totalSales.toFixed(2)}</strong></span>
                </div>
                {lines.map((l, i) => (
                  <div key={l.printed} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
                    <span className="min-w-0 flex-1 text-[14px] [overflow-wrap:anywhere]">{l.printed}
                      {!l.known && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "#FBF1E6", color: "#B45309" }}>New</span>}</span>
                    <input type="number" inputMode="decimal" aria-label={l.printed} value={l.amount ?? ""} onChange={(e) => setLine(i, e.target.value)}
                      className={"h-9 w-28 rounded-md border-0 px-2 text-right text-[14px] tabular-nums outline-none" + flagCls(l.printed)} style={{ background: "#EEF0EE" }} />
                  </div>
                ))}
                {problems.length > 0 && (
                  <div className="mt-3 space-y-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: "#FBF1E6", color: "#B45309" }}>
                    {problems.map((p) => <p key={p}>{p}</p>)}
                  </div>
                )}
              </div>
            );
          })() : (<>
          {/* Revenue section */}
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-display font-semibold text-foreground uppercase tracking-wide">Revenue</h4>
              <span className="text-xs text-muted-foreground">
                Total Sales: <strong className="text-foreground">{extractedData.totalSales.toFixed(2)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Subtotal</label>
                <input
                  type="number"
                  value={extractedData.subtotal || ""}
                  onChange={(e) => handleFieldChange("subtotal", e.target.value)}
                  className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("subtotal")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Service Charge</label>
                <input
                  type="number"
                  value={extractedData.serviceCharge || ""}
                  onChange={(e) => handleFieldChange("serviceCharge", e.target.value)}
                  className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("serviceCharge")}
                />
              </div>
              <div>
                <label className="text-xs text-destructive block mb-1">Discount</label>
                <input
                  type="number"
                  value={extractedData.discount ? Math.abs(extractedData.discount) : ""}
                  onChange={(e) => handleFieldChange("discount", String(-Math.abs(Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-destructive/40 bg-destructive/5 text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Total Sales (auto)</label>
                <input
                  type="number"
                  value={extractedData.totalSales ? extractedData.totalSales.toFixed(2) : ""}
                  readOnly
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-muted/40 text-foreground font-semibold cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Payments section */}
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-display font-semibold text-foreground uppercase tracking-wide">Payments</h4>
              <span className="text-xs text-muted-foreground">
                Total Payment: <strong className="text-foreground">{calcPaymentTotal.toFixed(2)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(["visa","mastercard","amex","unionPay","jcb","alipay","wechat","payme","cash","deliveroo","foodpanda","keeta"] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground block mb-1">{fieldLabels[field]}</label>
                  <input
                    type="number"
                    value={extractedData[field] || ""}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls(field)}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-destructive block mb-1">Card Tips</label>
                <input
                  type="number"
                  value={extractedData.cardTips ? Math.abs(extractedData.cardTips) : ""}
                  onChange={(e) => handleFieldChange("cardTips", e.target.value)}
                  className={"w-full px-3 py-2 text-sm rounded-lg border border-destructive/40 bg-destructive/5 text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30" + flagCls("cardTips")}
                />
              </div>
            </div>
          </div>

          </>)}
          </>)}

          <DeferredSalesFields record={extractedData} onChange={(key,value)=>setExtractedData({...extractedData,[key]:value})} />
          <DayNoteField prompt={notePrompt(extractedData, history)} body={noteBody} tag={noteTag} onBody={setNoteBody} onTag={setNoteTag} />

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              title={venueUnmatched ? "Select a venue from the master list first" : undefined}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Checking answer…" : "Check and post"}
            </Button>
            <button
              disabled={saving}
              onClick={() => { setExtractedData(null); setPreviewUrl(null); setOriginalFile(null); scannedRef.current = null; setOutcome(null); }}
              className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptScanner;
