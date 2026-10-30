import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, X, ScanLine, Loader2, Check, Camera, AlertTriangle } from "lucide-react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { useFloatingBaniSales, useFloatingBaniSay } from "@/components/assistant/FloatingBaniContext";
import { salesOutcomeMessage, type SalesSaveResult } from "@/utils/salesSaveResult";

import { SalesRecord } from "@/types/sales";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import InvoiceCamera from "@/components/invoices/InvoiceCamera";
import { getPaymentTotal } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { classifySalesFile } from "@/utils/salesFileIntake";
import { matchVenueName, shouldAutoProcessInitialFile } from "@/utils/venueMatch";
import { diagnoseSalesScan, hkd } from "@/utils/salesScanLearning";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { associateSalesScan } from "@/utils/salesScanEvidence";

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

const emptyRecord: SalesRecord = {
  date: "", day: "", venue: "", reportNumber: "",
  orders: 0, guests: 0, subtotal: 0, serviceCharge: 0, discount: 0, totalSales: 0,
  visa: 0, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, deliveroo: 0, foodpanda: 0, keeta: 0, cardTips: 0,
};

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
    setBaniSales(extractedData ? { record: extractedData, venues: activeVenueNames, apply: setExtractedData } : null);
  }, [extractedData, activeVenueNames, setBaniSales]);
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
  const [outcome, setOutcome] = useState<SalesSaveResult | null>(null);

  /** Reads any file (image or PDF) into raw base64 without relying on data-URL prefixes. */
  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onabort = () => reject(new Error("File reading was cancelled"));
    reader.readAsDataURL(file);
  });

  const guessMimeType = (file: File): string => {
    if (file.type) return file.type;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (ext === "pdf") return "application/pdf";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "heic" || ext === "heif") return "image/heic";
    return "image/jpeg";
  };

  const processFile = useCallback(async (file: File) => {
    setScanning(true);
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
        body: { imageBase64: base64, mimeType: guessMimeType(file), venues: activeVenueNames, tenantId },
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

      // Normalize the extracted data
      const raw = data.data;
      evidenceScanRef.current = typeof data.scanEvidenceId === "string" ? data.scanEvidenceId : null;
      const dateStr = raw.date || "";
      let dayStr = "";
      if (dateStr) {
        try {
          dayStr = format(parseISO(dateStr), "EEE");
        } catch {
          dayStr = "";
        }
      }
      // Match scanned venue against master (case-insensitive). Never silently reassign.
      const rawVenue = String(raw.venue ?? "").trim();
      setScannedVenueRaw(rawVenue);
      const matched = matchVenueName(rawVenue, activeVenueNames);

      const record: SalesRecord = {
        date: dateStr,
        day: dayStr,
        venue: matched, // blank forces the user to pick if no match
        reportNumber: raw.reportNumber || "",
        orders: Number(raw.orders) || 0,
        guests: Number(raw.guests) || 0,
        subtotal: Number(raw.subtotal) || 0,
        serviceCharge: Number(raw.serviceCharge) || 0,
        discount: -(Math.abs(Number(raw.discount) || 0)),
        totalSales: Number(raw.totalSales) || 0,
        visa: Number(raw.visa) || 0,
        mastercard: Number(raw.mastercard) || 0,
        amex: Number(raw.amex) || 0,
        unionPay: Number(raw.unionPay) || 0,
        jcb: Number(raw.jcb) || 0,
        alipay: Number(raw.alipay) || 0,
        wechat: Number(raw.wechat) || 0,
        payme: Number(raw.payme) || 0,
        cash: Number(raw.cash) || 0,
        deliveroo: Number(raw.deliveroo) || 0,
        foodpanda: Number(raw.foodpanda) || 0,
        keeta: Number(raw.keeta) || 0,
        cardTips: -(Math.abs(Number(raw.cardTips) || 0)),
      };

      scannedRef.current = record;
      setShowDetails(false);
      setExtractedData(record);
      setSaving(true);
      const result = await onSave(record, file, null, evidenceScanRef.current);
      setOutcome(result);
      setShowDetails(true);
      baniSay(salesOutcomeMessage(result));
      toast({ title: result.status === "failed" ? "Receipt not saved" : "Receipt flagged for review", description: salesOutcomeMessage(result), ...(result.status === "failed" ? { variant: "destructive" as const } : {}) });
    } catch (err) {
      console.error("Receipt scan error:", err);
      toast({ title: "Scan failed", description: "An unexpected error occurred.", variant: "destructive" });
      const result = await onSave(scannedRef.current ?? { ...emptyRecord }, file, null, evidenceScanRef.current).catch(() => ({ status: "failed" as const, error: "Receipt was not saved" }));
      setOutcome(result); setExtractedData(scannedRef.current ?? { ...emptyRecord });
      baniSay(salesOutcomeMessage(result));
    } finally {
      setScanning(false);
      setSaving(false);
    }
  }, [activeVenueNames, venuesLoading, baniSay, tenantId, onSave]);

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
  const diagnosis = extractedData ? diagnoseSalesScan(extractedData) : null;
  const flagged = new Set<string>(diagnosis?.fields ?? []);
  const ready = !!extractedData && !!diagnosis?.balanced && !venueUnmatched && !!extractedData.date;
  const compact = false;
  const flagCls = (f: string) => (flagged.has(f) ? " ring-2 ring-warning/60 border-warning/60" : "");

  const handleSave = async () => {
    if (!extractedData) return;
    setSaving(true);
    try {
      associateSalesScan(extractedData, evidenceScanRef.current);
      const result = await onSave(extractedData, originalFile, noteBody.trim() ? { body: noteBody, tag: noteTag } : null, evidenceScanRef.current);
      setOutcome(result);
      baniSay(salesOutcomeMessage(result));
      toast({ title: result.status === "failed" ? "Receipt not saved" : "Receipt flagged for review", description: salesOutcomeMessage(result), ...(result.status === "failed" ? { variant: "destructive" as const } : {}) });
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
      {!extractedData && !scanning && !showCamera && (
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
          <p className="text-xs text-muted-foreground">Reading your receipt…</p>
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
                See all lines
              </button>
            </div>
          )}

          {!compact && diagnosis && !diagnosis.balanced && (
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
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Orders</label>
              <input
                type="number"
                value={extractedData.orders || ""}
                onChange={(e) => handleFieldChange("orders", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("orders")}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Guests</label>
              <input
                type="number"
                value={extractedData.guests || ""}
                onChange={(e) => handleFieldChange("guests", e.target.value)}
                className={"w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" + flagCls("guests")}
              />
            </div>
          </div>

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

          <DayNoteField prompt={notePrompt(extractedData, history)} body={noteBody} tag={noteTag} onBody={setNoteBody} onTag={setNoteTag} />

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || outcome?.status === "flagged"}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              title={venueUnmatched ? "Select a venue from the master list first" : undefined}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving receipt for review…" : outcome?.status === "flagged" ? "Flagged · no sales posted" : "Retry saving receipt"}
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
