import { useCallback, useState } from "react";
import { Upload, X, ScanLine, Loader2, Check, Camera } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import InvoiceCamera from "@/components/invoices/InvoiceCamera";
import { getPaymentTotal } from "@/utils/salesUtils";
...
  const calcPaymentTotal = extractedData
    ? getPaymentTotal(extractedData)
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
