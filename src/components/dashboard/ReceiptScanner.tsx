import { useCallback, useState } from "react";
import { Upload, X, ScanLine, Loader2, Check } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ReceiptScannerProps {
  onSave: (record: SalesRecord) => Promise<void>;
  onClose: () => void;
}

const numberFields = [
  "orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales",
  "visa", "mastercard", "amex", "unionPay", "alipay", "wechat", "cash", "cardTips",
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
  alipay: "Alipay",
  wechat: "WeChat",
  cash: "Cash",
  cardTips: "Card Tips",
};

const emptyRecord: SalesRecord = {
  date: "", day: "", venue: "Assembly", reportNumber: "",
  orders: 0, guests: 0, subtotal: 0, serviceCharge: 0, discount: 0, totalSales: 0,
  visa: 0, mastercard: 0, amex: 0, unionPay: 0, alipay: 0, wechat: 0, cash: 0, cardTips: 0,
};

const ReceiptScanner = ({ onSave, onClose }: ReceiptScannerProps) => {
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<SalesRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum 10MB allowed.", variant: "destructive" });
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Please upload an image (JPG, PNG) or PDF.", variant: "destructive" });
      return;
    }

    // Show preview for images
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    setScanning(true);
    setExtractedData(null);

    try {
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("parse-receipt", {
        body: { imageBase64: base64, mimeType: file.type },
      });

      if (error) {
        toast({ title: "Scan failed", description: error.message, variant: "destructive" });
        setScanning(false);
        return;
      }

      if (!data?.success) {
        toast({ title: "Scan failed", description: data?.error || "Could not extract data.", variant: "destructive" });
        setScanning(false);
        return;
      }

      // Normalize the extracted data
      const raw = data.data;
      const dateStr = raw.date || "";
      let dayStr = "";
      if (dateStr) {
        try {
          dayStr = format(parseISO(dateStr), "EEE"); // Mon, Tue, etc.
        } catch { dayStr = ""; }
      }
      const record: SalesRecord = {
        date: dateStr,
        day: dayStr,
        venue: raw.venue === "Caliente" ? "Caliente" : "Assembly",
        reportNumber: raw.reportNumber || "",
        orders: Number(raw.orders) || 0,
        guests: Number(raw.guests) || 0,
        subtotal: Number(raw.subtotal) || 0,
        serviceCharge: Number(raw.serviceCharge) || 0,
        discount: Number(raw.discount) || 0,
        totalSales: Number(raw.totalSales) || 0,
        visa: Number(raw.visa) || 0,
        mastercard: Number(raw.mastercard) || 0,
        amex: Number(raw.amex) || 0,
        unionPay: Number(raw.unionPay) || 0,
        alipay: Number(raw.alipay) || 0,
        wechat: Number(raw.wechat) || 0,
        cash: Number(raw.cash) || 0,
        cardTips: Number(raw.cardTips) || 0,
      };

      setExtractedData(record);
      toast({ title: "Receipt scanned!", description: "Please review the extracted data below." });
    } catch (err) {
      console.error("Receipt scan error:", err);
      toast({ title: "Scan failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, []);

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
        return { ...prev, [field]: Number(value) || 0 };
      }
      if (field === "venue") {
        return { ...prev, venue: value === "Caliente" ? "Caliente" : "Assembly" };
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

  // Auto-calculated validation
  const calcTotalSales = extractedData
    ? extractedData.subtotal + extractedData.serviceCharge - extractedData.discount
    : 0;
  const calcPaymentTotal = extractedData
    ? extractedData.visa + extractedData.mastercard + extractedData.amex +
      extractedData.unionPay + extractedData.alipay + extractedData.wechat + extractedData.cash
    : 0;

  const totalSalesMismatch = extractedData
    ? Math.abs(extractedData.totalSales - calcTotalSales) > 0.01
    : false;
  const paymentMismatch = extractedData
    ? Math.abs(calcPaymentTotal - extractedData.totalSales) > 0.01
    : false;

  const handleSave = async () => {
    if (!extractedData) return;
    if (!extractedData.date) {
      toast({ title: "Date required", description: "Please enter a date before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave(extractedData);
      toast({ title: "Record saved successfully!" });
      setExtractedData(null);
      setPreviewUrl(null);
      setTimeout(onClose, 800);
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

      {/* Drop zone */}
      {!extractedData && !scanning && (
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
      )}

      {/* Scanning state */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Scanning receipt with AI...</p>
        </div>
      )}

      {/* Extracted data review */}
      {extractedData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            {previewUrl && (
              <img src={previewUrl} alt="Receipt" className="h-20 w-auto rounded-lg border border-border object-cover" />
            )}
            <p className="text-sm text-muted-foreground">Review and correct the extracted data, then click Save.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Date */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input
                type="date"
                value={extractedData.date}
                onChange={(e) => handleFieldChange("date", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {/* Day */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Day</label>
              <input
                type="text"
                value={extractedData.day}
                onChange={(e) => handleFieldChange("day", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {/* Venue */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Venue</label>
              <select
                value={extractedData.venue}
                onChange={(e) => handleFieldChange("venue", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="Assembly">Assembly</option>
                <option value="Caliente">Caliente</option>
              </select>
            </div>
            {/* Report # */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Report #</label>
              <input
                type="text"
                value={extractedData.reportNumber}
                onChange={(e) => handleFieldChange("reportNumber", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
          </div>

          {/* Validation warnings */}
          {(totalSalesMismatch || paymentMismatch) && (
            <div className="space-y-2">
              {totalSalesMismatch && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                  <span className="text-destructive font-semibold shrink-0">⚠</span>
                  <div>
                    <span className="font-medium text-destructive">Total Sales mismatch:</span>{" "}
                    <span className="text-foreground">
                      Subtotal ({extractedData!.subtotal.toFixed(2)}) + Service Charge ({extractedData!.serviceCharge.toFixed(2)}) − Discount ({extractedData!.discount.toFixed(2)}) ={" "}
                      <strong>{calcTotalSales.toFixed(2)}</strong>, but Total Sales is <strong>{extractedData!.totalSales.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              )}
              {paymentMismatch && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                  <span className="text-destructive font-semibold shrink-0">⚠</span>
                  <div>
                    <span className="font-medium text-destructive">Payment total mismatch:</span>{" "}
                    <span className="text-foreground">
                      Sum of payments = <strong>{calcPaymentTotal.toFixed(2)}</strong>, but Total Sales is <strong>{extractedData!.totalSales.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
            {/* Number fields */}
            {numberFields.map((field) => (
              <div key={field}>
                <label className="text-xs text-muted-foreground block mb-1">{fieldLabels[field]}</label>
                <input
                  type="number"
                  value={extractedData[field] || ""}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Record"}
            </button>
            <button
              onClick={() => { setExtractedData(null); setPreviewUrl(null); }}
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
